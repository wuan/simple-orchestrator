# fix-environment-image-platforms

Publish each environment image index with only `linux/amd64` and `linux/arm64`,
keep the provenance and SBOM as signed attestations outside the index, and build
only the native platform on pull requests
