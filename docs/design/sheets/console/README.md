# Console sheets: B0

The console's frame and its audit log, drawn on the Design canvas and approved on 19 Sep 2026. Phase 2 builds from these files. Where they differ from the B0 prompts in `docs/superpowers/specs/phase-1-sheets/b0-calibration.md`, these files win.

| File | Sheet |
|---|---|
| `Main.dc.html` | Console Shell at 1440 |
| `ShellPhone.dc.html` | Console Shell at 390 |
| `AuditLog.dc.html` | Console Audit Log at 1440 |
| `AuditLogPhone.dc.html` | Console Audit Log at 390 |
| `ShellConfirm.dc.html`, `ShellNight.dc.html`, `AuditRecord.dc.html` | State boards: a sheet above with its props set |
| `canvas.json` | The canvas layout |
| `industry.css` | The console's classes |

Each sheet's states are the props in its `data-props`: role, environment, notice, dialog, menu, page or state, and Day or Night. `industry.css` copies its tokens from `src/styles/theme.css` (same names and values), and its classes follow the components in `src/components/ui`. Each class names the component it mirrors.

## Decided at the review

- In the console, steel text uses the readable steel, `--accent-text`: outline tags and ghost buttons are #416180 by day and #b5d9fd by night. The locked steel (#5980a6) stays for fills, rules, lamps and the focus ring. The primary button keeps the locked pairing.
- The frame's own tags (the environment, CONSOLE and the member's role) are condensed capitals. Data tags stay in sentence case.
- Result tags: Done is an outline tag; Refused and Failed are grey tags.
- The record drawer floats 12px in from the window edges, so all four corner marks show. On phones it's a full-screen sheet.
