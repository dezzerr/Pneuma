#!/bin/sh
# Build the pinned MIT-licensed transcribe.cpp worker for Apple Silicon.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/pneuma-parakeet-build.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
commit=275cd50d2c4104c204009a197ac091b9687668e5
git clone --no-checkout https://github.com/handy-computer/transcribe.cpp.git "$tmp/source"
git -C "$tmp/source" checkout --detach "$commit"
cp "$root/scripts/parakeet/worker.c" "$tmp/source/examples/hello_stream/pneuma-worker.c"
printf '\nadd_executable(pneuma-parakeet pneuma-worker.c)\ntarget_link_libraries(pneuma-parakeet PRIVATE transcribe)\n' >> "$tmp/source/examples/hello_stream/CMakeLists.txt"
cmake -S "$tmp/source" -B "$tmp/build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64
cmake --build "$tmp/build" --target pneuma-parakeet --parallel 4
mkdir -p "$root/resources/parakeet/mac-arm64"
cp "$tmp/build/bin/pneuma-parakeet" "$root/resources/parakeet/mac-arm64/"
