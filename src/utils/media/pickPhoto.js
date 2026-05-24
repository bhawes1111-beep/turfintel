// Phase 7A.6 — Shared one-shot photo picker.
//
// Creates an off-screen <input type="file" accept="image/*" capture="environment">,
// clicks it, fires onFile(file) once the user picks one, then removes the
// element. Used by every moisture entry point that needs to attach a photo:
//
//   - MoistureCaptureSheet — "+ Add photo" toast action (post-Save staging)
//   - MoistureOverview      — "+ 📷" row chip (empty-state attach)
//   - MoisturePhotoViewer   — "+ Add another" footer (attach to existing row)
//
// `capture="environment"` opens the rear camera directly on iOS Safari /
// Android Chrome. Unsupported browsers ignore the attribute and show a
// standard file picker — that's the expected fallback.
//
// Pure DOM helper. No React, no store, no toast.

/**
 * @param {(file: File) => void} onFile  - invoked once with the picked file
 *                                          (no-op if the user cancels)
 */
export function openPhotoPicker(onFile) {
  const input = document.createElement('input')
  input.type    = 'file'
  input.accept  = 'image/*'
  input.capture = 'environment'
  input.style.position      = 'fixed'
  input.style.opacity       = '0'
  input.style.pointerEvents = 'none'

  input.onchange = () => {
    const file = input.files && input.files[0]
    if (file) onFile(file)
    // Detach on next tick so the change event fully fires first.
    setTimeout(() => { try { input.remove() } catch { /* noop */ } }, 0)
  }

  // Some browsers require the input to be in the DOM for the click to open
  // the picker; attach briefly. If the user cancels, browsers don't fire a
  // reliable cancel event — a focus listener cleans up after focus returns.
  document.body.appendChild(input)
  const cleanup = () => {
    setTimeout(() => { try { input.remove() } catch { /* noop */ } }, 1500)
    window.removeEventListener('focus', cleanup)
  }
  window.addEventListener('focus', cleanup)
  input.click()
}
