# Profile-card fonts

Vendored, not installed. `src/ui/canvas/fonts.ts` registers these three files by
absolute path resolved from its own module location, and **throws at startup if
any is missing** — profile cards name the families directly (`16px InterSemi`),
and a missing registration silently falls back to whatever the host has
installed rather than erroring. That failure is invisible on a developer machine
with hundreds of system fonts and renders blank boxes in a slim container with
none, so it is caught loudly instead.

| File | Family used in code |
| --- | --- |
| `Inter-Regular.ttf` | `Inter` |
| `Inter-SemiBold.ttf` | `InterSemi` |
| `Inter-Bold.ttf` | `InterBold` |

Inter v4.1 by Rasmus Andersson, [SIL Open Font License 1.1](./LICENSE.txt) —
redistributable, including bundled in an application. Source:
<https://github.com/rsms/inter/releases/tag/v4.1>.

To update, replace the `.ttf` files with the same three weights from a newer
release. Adding a weight means adding it to `FONTS` in `src/ui/canvas/fonts.ts`.
