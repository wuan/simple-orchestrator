# check-environment-image-updates

Refresh a repository's environment image before starting a containerized turn,
so a mutable tag such as `latest` picks up a newly published image, with an
`environment.pull` policy (`always`, `missing`, `never`) to opt out or run
offline and a digest-pinned image treated as immutable
