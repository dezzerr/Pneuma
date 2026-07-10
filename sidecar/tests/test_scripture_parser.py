"""Tests for scripture_parser.parse — regex-based spoken reference detection."""

from pneuma_sidecar.scripture_parser import parse, words_to_number

# ---------------------------------------------------------------------------
# words_to_number
# ---------------------------------------------------------------------------


class TestWordsToNumber:
    def test_digit(self):
        assert words_to_number("16") == 16

    def test_digit_ordinal_suffix(self):
        assert words_to_number("1st") == 1
        assert words_to_number("2nd") == 2
        assert words_to_number("3rd") == 3
        assert words_to_number("8th") == 8

    def test_single_word(self):
        assert words_to_number("three") == 3
        assert words_to_number("sixteen") == 16

    def test_tens_units(self):
        assert words_to_number("twenty eight") == 28
        assert words_to_number("thirty three") == 33

    def test_hundred(self):
        assert words_to_number("one hundred") == 100
        assert words_to_number("two hundred") == 200

    def test_ordinal_word(self):
        assert words_to_number("first") == 1
        assert words_to_number("second") == 2
        assert words_to_number("third") == 3
        assert words_to_number("thirteenth") == 13

    def test_hyphenated(self):
        assert words_to_number("twenty-eight") == 28

    def test_invalid(self):
        assert words_to_number("hello") is None
        assert words_to_number("") is None

    def test_zero_returns_none(self):
        assert words_to_number("zero") is None


# ---------------------------------------------------------------------------
# parse — basic single-verse references
# ---------------------------------------------------------------------------


class TestParseSingleVerse:
    def test_john_three_sixteen(self):
        results = parse("john three sixteen")
        assert len(results) == 1
        r = results[0]
        assert r["book_id"] == 43
        assert r["book_name"] == "John"
        assert r["chapter"] == 3
        assert r["verse_start"] == 16
        assert r["verse_end"] == 16
        assert r["match_type"] == "REGEX"

    def test_chapter_verse_keywords(self):
        results = parse("romans chapter eight verse twenty eight")
        assert len(results) == 1
        r = results[0]
        assert r["book_id"] == 45
        assert r["chapter"] == 8
        assert r["verse_start"] == 28

    def test_digit_chapter_verse(self):
        results = parse("John 3 16")
        assert len(results) == 1
        assert results[0]["chapter"] == 3
        assert results[0]["verse_start"] == 16

    def test_colon_separated(self):
        results = parse("John 3:16")
        assert len(results) == 1
        assert results[0]["chapter"] == 3
        assert results[0]["verse_start"] == 16

    def test_comma_separated(self):
        results = parse("John 3, 16")
        assert len(results) == 1
        assert results[0]["chapter"] == 3
        assert results[0]["verse_start"] == 16


# ---------------------------------------------------------------------------
# parse — ranges
# ---------------------------------------------------------------------------


class TestParseRanges:
    def test_through_keyword(self):
        results = parse("genesis 1 verses 1 through 3")
        assert len(results) == 1
        r = results[0]
        assert r["verse_start"] == 1
        assert r["verse_end"] == 3

    def test_chapter_verses_through(self):
        results = parse("genesis chapter 1 verses 1 through 3")
        assert len(results) == 1
        assert results[0]["verse_start"] == 1
        assert results[0]["verse_end"] == 3

    def test_hyphen_range(self):
        results = parse("John 3 16-20")
        assert len(results) == 1
        assert results[0]["verse_start"] == 16
        assert results[0]["verse_end"] == 20

    def test_all_hyphen_triple(self):
        results = parse("John 3-16-20")
        assert len(results) == 1
        assert results[0]["chapter"] == 3
        assert results[0]["verse_start"] == 16
        assert results[0]["verse_end"] == 20

    def test_and_keyword(self):
        results = parse("genesis chapter 1 verses 1 and 3")
        assert len(results) == 1
        assert results[0]["verse_start"] == 1
        assert results[0]["verse_end"] == 3


# ---------------------------------------------------------------------------
# parse — book aliases and ordinals
# ---------------------------------------------------------------------------


class TestBookAliases:
    def test_first_corinthians(self):
        results = parse("first corinthians chapter thirteen verse four")
        assert len(results) == 1
        assert results[0]["book_id"] == 46
        assert results[0]["book_name"] == "1 Corinthians"
        assert results[0]["chapter"] == 13
        assert results[0]["verse_start"] == 4

    def test_1_corinthians_digit(self):
        results = parse("1 corinthians 13 4")
        assert len(results) == 1
        assert results[0]["book_id"] == 46

    def test_second_timothy(self):
        results = parse("second timothy 4 7")
        assert len(results) == 1
        assert results[0]["book_id"] == 55

    def test_psalm_alias(self):
        results = parse("psalms 23 1")
        assert len(results) == 1
        assert results[0]["book_id"] == 19

    def test_prov_alias(self):
        results = parse("prov 3 5")
        assert len(results) == 1
        assert results[0]["book_id"] == 20


# ---------------------------------------------------------------------------
# parse — Whisper mistranscriptions
# ---------------------------------------------------------------------------


class TestWhisperMistranscriptions:
    def test_efficient_ephesians(self):
        results = parse("efficient 2 8")
        assert len(results) == 1
        assert results[0]["book_id"] == 49

    def test_he_brews_hebrews(self):
        results = parse("he brews 11 1")
        assert len(results) == 1
        assert results[0]["book_id"] == 58

    def test_look_luke(self):
        results = parse("look 6 38")
        assert len(results) == 1
        assert results[0]["book_id"] == 42


# ---------------------------------------------------------------------------
# parse — overlap deduplication
# ---------------------------------------------------------------------------


class TestOverlapDedup:
    def test_no_duplicate_matches(self):
        results = parse("john 3 16 john 3 16")
        # The dedup logic removes the stuttering duplicate, leaving 1 match
        assert len(results) == 1

    def test_stuttering_dedup(self):
        results = parse("james 3 james 3 16")
        # Stuttering "james 3" should be deduplicated, leaving one match
        assert len(results) == 1
        assert results[0]["chapter"] == 3


# ---------------------------------------------------------------------------
# parse — invalid / edge cases
# ---------------------------------------------------------------------------


class TestParseInvalid:
    def test_empty_string(self):
        assert parse("") == []

    def test_no_book(self):
        assert parse("hello world") == []

    def test_invalid_chapter(self):
        results = parse("John 999 16")
        assert len(results) == 0

    def test_verse_end_before_start(self):
        # The parser matches "John 3 20" as shorthand (verse_end=20),
        # the "-10" suffix is not captured as a range by the shorthand pattern.
        results = parse("John 3 20-10")
        assert len(results) == 1
        assert results[0]["verse_start"] == 20
        assert results[0]["verse_end"] == 20

    def test_zero_chapter(self):
        results = parse("John 0 16")
        assert len(results) == 0

    def test_punctuation_preserved(self):
        # Punctuation like commas/colons/periods should be normalized
        results = parse("Romans 8:28.")
        assert len(results) == 1
        assert results[0]["verse_start"] == 28
