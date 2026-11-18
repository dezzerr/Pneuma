import { get, type Unsubscriber } from "svelte/store"
import { uid } from "uid"
import type { AiSuggestion, MatchResult } from "../../../types/ai/Ai"
import type { ConfidenceLevels } from "../../../types/ai/AiSettings"
import { startScripture } from "../../components/actions/apiHelper"
import { keysToID } from "../../components/helpers/array"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { setActiveScripture } from "../../converters/bible"
import { ai, aiSmartAction, aiSuggestions, drawerTabsData, outputs, scriptures } from "../../stores"
import { newToast } from "../../utils/common"
import { getLLMManager } from "../llm/llmManager"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleVersion } from "../scripture/BibleVersionDetector"
import { isReferenceWithin } from "../scripture/references"

export class AiManager {
    private static lastMatch: number = 0
    private static MAX_LLM_REQUEST_AFTER_MATCH = 5000
    private static latestSearchId: number = 0

    static async processSTTChunk(chunk: { chunkWithOverlap: string; newWordsCount: number; confidence?: number; finalizedOverlap?: string }) {
        this.triggerBackgroundPreload()

        const searchId = ++this.latestSearchId
        const isCancelled = () => searchId !== this.latestSearchId

        const references = chunk.finalizedOverlap === undefined ? [] : await this.finalReferenceDetection(chunk.chunkWithOverlap, chunk.finalizedOverlap)
        for (const match of references) this.newMatch(match)
        if (references.length) this.lastMatch = Date.now()
        if (isCancelled() || (references.length > 0 && references.every((match) => match.confidence <= 50))) return

        const stringMatch = await this.stringDetection(chunk.chunkWithOverlap, isCancelled)
        if (isCancelled()) return
        // Keep follow-on verses and phonetic suggestions after a complete
        // reference. A content match inferred from the same words is redundant.
        if (references.length && (!stringMatch || stringMatch.scriptureMatchType === "content" || references.some((match) => match.content === stringMatch.content))) return
        if (stringMatch) {
            this.newMatch(stringMatch)
            this.lastMatch = Date.now()
            return
        }

        if (this.lastMatch && Date.now() - this.lastMatch < this.MAX_LLM_REQUEST_AFTER_MATCH) return

        const llmManager = getLLMManager()
        if (!llmManager) return

        // only report to LLM if nothing is auto detected
        const llmMatch = await llmManager.detectMatch(chunk)
        if (!isCancelled() && llmMatch) {
            this.newMatch(llmMatch)
            this.lastMatch = Date.now()
        }
    }

    private static async finalReferenceDetection(text: string, overlap: string) {
        const bibleId = get(drawerTabsData)?.scripture?.activeSubTab
        if (!bibleId || get(scriptures)[bibleId]?.api) return []
        const cache = await BibleCacheManager.getCache(bibleId)
        if (!cache || bibleId !== get(drawerTabsData)?.scripture?.activeSubTab) return []
        return cache.findFinalReferences(text, overlap).map((match) => ({ ...match, scriptureTranslation: bibleId }))
    }

    private static async stringDetection(textChunk: string, isCancelled?: () => boolean) {
        const scriptureMatch = await this.globalBibleDetection(textChunk, isCancelled)
        if (scriptureMatch) return scriptureMatch

        const scriptureVersionMatch = await detectBibleVersion(textChunk, isCancelled)
        if (scriptureVersionMatch) return scriptureVersionMatch

        return null
    }

    private static isPreloadStarted: boolean = false
    private static triggerBackgroundPreload() {
        if (this.isPreloadStarted) return
        this.isPreloadStarted = true

        // load scriptures
        const localScriptureIds = this.getLocalScriptureIds()
        BibleCacheManager.preloadAllInBackground(localScriptureIds)
    }

    private static getLocalScriptureIds() {
        return keysToID(get(scriptures))
            .filter((a) => !a.api && !a.collection)
            .map((a) => a.id)
    }

    private static scriptureAlerted: boolean = false
    private static async globalBibleDetection(textChunk: string, isCancelled?: () => boolean) {
        const activeBibleId = get(drawerTabsData)?.scripture?.activeSubTab
        if (!activeBibleId) return null

        const scriptureData = get(scriptures)[activeBibleId]
        if (scriptureData?.api) {
            if (!this.scriptureAlerted) newToast("Please use a local Bible instead of an API Bible for the auto detection!")
            this.scriptureAlerted = true
            return null
        }

        const match = await this.bibleDetection(activeBibleId, textChunk, isCancelled)
        if (!match) return null

        // reference type matches stays on the active scripture
        if (match.scriptureMatchType !== "content") return match

        let highestConfidence = match.confidence || 0

        // Non-blocking concurrent scan
        Promise.all(
            this.getLocalScriptureIds().map(async (id) => {
                // already checked
                if (id === activeBibleId) return

                const otherMatch = await this.bibleDetection(id, textChunk, isCancelled)
                if (!isCancelled?.() && otherMatch?.confidence && otherMatch.confidence > highestConfidence) {
                    highestConfidence = otherMatch.confidence
                    this.newMatch({ ...otherMatch, scriptureIsNewTranslation: true })
                }
            })
        )

        return match
    }

    private static async bibleDetection(id: string, textChunk: string, isCancelled?: () => boolean) {
        const bibleCache = await BibleCacheManager.getCache(id)
        if (!bibleCache || isCancelled?.()) return null

        const match = await bibleCache.search(textChunk, AiManager.liveContent, isCancelled)
        if (!match) return null

        match.scriptureTranslation = id
        return match
    }

    /////

    private static autoPresentation = Promise.resolve()
    private static pendingPresentations = new Set<string>()

    static newMatch(match: MatchResult) {
        if (match.type === "empty" || !match.content) return
        if (match.type === "scripture" && AiManager.liveContent === match.content) return

        if (match.type !== "scripture" && match.type !== "scripture_version") return // WIP only scripture is implemented

        let suggestionDraft: any = {
            id: uid(5),
            timestamp: Date.now(),
            content: match.content,
            confidence: match.confidence
        }
        suggestionDraft.scriptureTranslation = match.scriptureTranslation

        const trigger = () => this.triggerMatchAction(match)
        const action = match.type === "scripture_version" ? "open_scripture" : "present"
        const suggestion = { ...suggestionDraft, action, trigger }
        const key = JSON.stringify([match.scriptureTranslation, match.content])
        if (this.pendingPresentations.has(key)) return
        const autoPlay = this.shouldAutoPlay(match, true)
        this.addSuggestion(suggestion)

        if (!autoPlay) return
        this.pendingPresentations.add(key)
        // The Scripture drawer resolves one request at a time. Wait for its
        // result before sending another verse from the same speech segment.
        this.autoPresentation = this.autoPresentation
            .then(async () => {
                if (this.liveContent === match.content || !this.shouldAutoPlay(match, false)) return
                if (!(await this.triggerMatchAction(match))) return
                const presented = { ...suggestion, action: "presented", trigger: undefined }
                aiSuggestions.update((list) => list.map((item) => (item.id === suggestion.id ? presented : item)))
                if (get(aiSmartAction)?.id === suggestion.id) this.setSmartAction(presented)
            })
            .catch((error) => console.error("Could not present detected scripture:", error))
            .finally(() => {
                this.pendingPresentations.delete(key)
            })

    }

    private static alreadySuggested(match: MatchResult): boolean {
        // get suggested, but remove any suggestions that have lower confidence than the current match
        const suggested = get(aiSuggestions)
            .filter((a) => a.content !== match.content || a.confidence >= match.confidence)
            .filter((a) => !isReferenceWithin(match.content, a.content))
            .map((item) => item.content)

        return suggested.includes(match.content)
    }

    private static MAX_AUTO_PLAY_INTERVAL = 30000
    private static shouldAutoPlay(match: MatchResult, checkSuggestions: boolean): boolean {
        if (checkSuggestions && match.confidence <= 95 && this.alreadySuggested(match)) return false

        if (match.type === "scripture_version") return false
        if (match.type !== "scripture") return false // WIP currently only auto-plays scripture matches

        if (match.type === "scripture" && match.scriptureIsNewTranslation) return false

        // never auto-play low confidence matches
        if (match.confidence <= 50) return false

        const now = Date.now()
        // skip if the output was manually updated recently
        if (this.lastOutputUpdate && now - this.lastOutputUpdate < this.MAX_AUTO_PLAY_INTERVAL) return false

        const confidence = get(ai)[match.type]?.confidence || "ask"
        if (confidence === "ask") return false

        const autoPlay = match.confidence > this.getConfidenceScore(confidence)
        if (autoPlay) this.listenToOutput()
        return autoPlay
    }

    private static getConfidenceScore(confidence: ConfidenceLevels): number {
        if (confidence === "highest") return 95
        if (confidence === "high") return 75
        if (confidence === "medium") return 50
        return 100
    }

    static liveContent: string = ""
    private static async triggerMatchAction(match: MatchResult) {
        if (match.type === "scripture_version") {
            if (match.scriptureTranslation) setActiveScripture(match.scriptureTranslation)
            return false
        }
        if (match.type !== "scripture") return false

        return new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000)
            startScripture({ id: match.scriptureTranslation, reference: match.content }, (presented) => {
                clearTimeout(timeout)
                if (presented) {
                    this.liveContent = match.content
                    this.lastOutputUpdate = 0
                }
                resolve(presented)
            }).catch((error) => {
                clearTimeout(timeout)
                console.error("Could not present detected scripture:", error)
                resolve(false)
            })
        })
    }

    /////

    private static smartActionTimer: NodeJS.Timeout | null = null
    private static SMART_ACTION_DURATION = 30 * 1000 // 30 seconds
    private static setSmartAction(content: AiSuggestion) {
        aiSmartAction.set(content)

        const TIMEOUT = content.action === "presented" ? 4000 : this.SMART_ACTION_DURATION

        if (this.smartActionTimer) {
            clearTimeout(this.smartActionTimer)
            this.smartActionTimer = null
        }
        this.smartActionTimer = setTimeout(() => {
            this.smartActionTimer = null
            aiSmartAction.update((a) => (a?.id === content.id ? null : a))
        }, TIMEOUT)
    }

    private static SUGGESTION_MAX_AGE = 5 * 60 * 1000 // 5 minutes
    private static SUGGESTION_LIMIT = 15
    private static addSuggestion(content: AiSuggestion) {
        this.setSmartAction(content)

        aiSuggestions.update((list) => {
            const now = Date.now()

            // remove timed out suggestions
            let active = list.filter((a) => now - a.timestamp < this.SUGGESTION_MAX_AGE)

            // remove duplicate suggestions
            active = active.filter((a) => a.id !== content.id && a.content !== content.content)

            return [content, ...active].slice(0, this.SUGGESTION_LIMIT)
        })
    }

    /////

    private static lastOutputUpdate = 0
    private static outputListener: Unsubscriber | null = null
    private static listenToOutput() {
        if (this.outputListener) return

        let initialized = false
        setTimeout(() => (initialized = true), 1000)

        let previousOutput = ""
        this.outputListener = outputs.subscribe(() => {
            const firstOutput = getFirstActiveOutput()
            const slide = firstOutput?.out?.slide || null

            const slideKey = JSON.stringify(slide)
            if (slideKey === previousOutput) return
            previousOutput = slideKey

            if (initialized) {
                this.liveContent = ""
                this.lastOutputUpdate = Date.now()
            }
        })
    }
}
