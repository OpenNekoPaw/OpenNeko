# @neko/screenplay-domain

Host-neutral owner of canonical Fountain parsing and source-positioned screenplay projections.
Workspace text remains authoritative; every normalized document is an immutable, disposable
projection of one source snapshot. The public root is the only production Fountain grammar entry.

Parse failures are document-local diagnostics. The package does not read files, render HTML, own
editor state, or recover through another parser.

`fountain-js` 1.2.4 is used under its MIT license. Its license text is retained by the package
manager in the installed dependency and distribution notices.
