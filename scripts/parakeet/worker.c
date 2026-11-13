/* Pneuma local streaming worker. PCM input: 16 kHz mono signed 16-bit LE.
   Streaming inference uses transcribe.cpp (MIT), see THIRD_PARTY_NOTICES. */
#include "transcribe.h"
#include "transcribe/parakeet.h"
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

static void json_string(const char *s) {
    putchar('"');
    if (s) for (; *s; ++s) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
        else if (c == '\n') fputs("\\n", stdout);
        else if (c == '\r') fputs("\\r", stdout);
        else if (c == '\t') fputs("\\t", stdout);
        else if (c >= 32) putchar(c);
    }
    putchar('"');
}
static void emit_text(struct transcribe_session *session) {
    struct transcribe_stream_text text;
    transcribe_stream_text_init(&text);
    if (transcribe_stream_get_text(session, &text) != TRANSCRIBE_OK) return;
    fputs("{\"type\":\"text\",\"committed\":", stdout); json_string(text.committed_text);
    fputs(",\"tentative\":", stdout); json_string(text.tentative_text);
    fputs("}\n", stdout); fflush(stdout);
}
int main(int argc, char **argv) {
    if (argc != 2) { fprintf(stderr, "Model path is required\n"); return 1; }
    struct transcribe_session *session = NULL;
    transcribe_status status = transcribe_open(argv[1], NULL, NULL, &session);
    if (status != TRANSCRIBE_OK) { fprintf(stderr, "Model load: %s\n", transcribe_status_string(status)); return 1; }
    struct transcribe_stream_params stream; transcribe_stream_params_init(&stream);
    struct transcribe_parakeet_buffered_stream_ext geometry; transcribe_parakeet_buffered_stream_ext_init(&geometry);
    geometry.left_ms = 5600; geometry.chunk_ms = 560; geometry.right_ms = 560; stream.family = &geometry.ext;
    status = transcribe_stream_begin(session, NULL, &stream);
    if (status != TRANSCRIBE_OK) { fprintf(stderr, "Stream start: %s\n", transcribe_status_string(status)); transcribe_session_free(session); return 1; }
    fputs("{\"type\":\"ready\"}\n", stdout); fflush(stdout);
    int16_t input[3200]; float samples[3200]; size_t n;
    while ((n = fread(input, sizeof(int16_t), 3200, stdin)) > 0) {
        for (size_t i = 0; i < n; ++i) samples[i] = input[i] / 32768.0f;
        struct transcribe_stream_update update; transcribe_stream_update_init(&update);
        status = transcribe_stream_feed(session, samples, (int)n, &update);
        if (status != TRANSCRIBE_OK) { fprintf(stderr, "Stream feed: %s\n", transcribe_status_string(status)); transcribe_session_free(session); return 1; }
        if (update.result_changed) emit_text(session);
    }
    struct transcribe_stream_update final; transcribe_stream_update_init(&final);
    status = transcribe_stream_finalize(session, &final);
    if (status == TRANSCRIBE_OK) emit_text(session);
    transcribe_session_free(session);
    return status == TRANSCRIBE_OK ? 0 : 1;
}
