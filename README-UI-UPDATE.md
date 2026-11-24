# AutoDS Frontend UI refresh — iteration 1

This update keeps the existing Next.js 14 / React 18 / Tailwind stack and the existing FastAPI API contract.

## Included
- New dark AI Command Center shell with a responsive sidebar, workspace hero and experiment summary cards.
- Redesigned sign-in wrapper and dataset upload experience.
- Live eight-agent orchestration diagram. Agent state is derived from the existing `Run.steps` stream; it does not simulate backend progress.
- Existing configuration, results, history, authentication, downloads and SSE/polling integrations are retained.
- Removed the nonfunctional URL-import UI from Dropzone. The checked-in API client only implements CSV file upload (`POST /api/runs`), and the previous `Dropzone` required an `onUrl` prop that the page did not provide.
- No new npm dependencies.

## Apply
1. Back up your local `frontend` folder or commit current changes.
2. Extract this archive into `C:\dev\auto-ds-team` and allow it to merge/overwrite the `frontend` folder.
3. In PowerShell:

```powershell
cd C:\dev\auto-ds-team\frontend
npx tsc --noEmit
npm run dev
```

4. Keep the backend running in another terminal. Open `http://localhost:3000`.

## Validation note
TypeScript passed once before the final small layout adjustment to the agent diagram. A production build could not be completed in the Linux validation container because the archive contains Windows `node_modules` and Next.js attempted to download its Linux SWC binary while network access was unavailable. Run the commands above on the Windows development machine to validate in its native environment.
