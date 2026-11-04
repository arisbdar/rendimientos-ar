# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Bump `path-to-regexp` from 8.3.0 to 8.4.2 to address a high-severity backtracking ReDoS advisory ([GHSA-9wv6-86v2-598j](https://github.com/advisories/GHSA-9wv6-86v2-598j)). Transitive dependency of Express; affects only the local development server.

[Unreleased]: https://github.com/arisbdar/rendimientos-ar/compare/main...HEAD
