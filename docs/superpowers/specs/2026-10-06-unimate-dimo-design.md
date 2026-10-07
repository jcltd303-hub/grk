# UniMate and DIMO integration for Bendy / GRK

Status: draft for user review. Product implementation has not started.

## Intent and assumptions

Add the actual UniMate and DIMO models to the existing editor. The user explicitly selected actual models through a GPU worker, with results brought back into GRK. The target repository is assumed to be `jcltd303-hub/grk` from the Bendy project context.

Success means a user can submit their own asset, generate real model output, preview it, and retain an exportable result. A preset or simulated worker response does not satisfy this requirement.

Preserve the current mobile workflow and exclusive ownership of artwork pixels. Keep model controls together in the existing animation panel. Heavy processing runs outside the browser and the Vite bundle.

Inspected GRK revision: `3503870904f413067499bad369ca381f16eadef0`.

## Features and their outputs

| Model | Features to expose | Result in GRK |
| --- | --- | --- |
| UniMate | Text-generated motion variants; keyframe in-betweening; prompt-based editing while retaining selected joints; chained prompts for longer motion | Preview; projected, editable 2D clips when a joint map exists; native 3D artifacts for uploaded rigged assets |
| DIMO | Image-to-object motion learning; motion rendering; latent interpolation; language-guided motion; fitting an unseen motion, including the unaligned fitting mode | Reference and orbit previews; rendered frame export; reusable trained object and derived model artifacts |

UniMate and DIMO have different representations. DIMO's learned Gaussian scene and unsupervised key points do not provide a named skeletal hierarchy. Its initial integration therefore produces rendered animation assets rather than automatically claiming a Spine skeleton. UniMate clips mapped onto the current rig use the existing Spine export path.

## Recommended architecture

Use one asynchronous motion-service interface with isolated model environments. This keeps the frontend workflow unified and allows the worker environments to share one GPU sequentially. Separate GPU hosts remain an alternative if throughput later requires them.

The editor sends authenticated asset and job requests through a small application API. Model subprocesses run on a separate NVIDIA CUDA worker. The API returns promptly; the editor polls job status. GPU work never lives inside a request to the frontend hosting service.

Worker configuration includes upstream checkout locations, Python interpreters, checkpoint locations, an artifact directory, and allowed frontend origins. Pin the inspected upstream revisions rather than tracking `main` automatically:

- UniMate: `004d787452e0bf8253d669d6e7b26c2064055cad`.
- DIMO: `0c5938689071eda305d6625160e5d6e032a0ff9a`.

Dependencies require separate environments: UniMate; DIMO's PyTorch/CUDA stack; the selected image-to-video backend; SV4D; and a local vision-language model environment if selected. Follow each upstream setup rather than resolving these into one Python installation.

Provisioning or purchasing GPU resources is outside this change. Deliver a portable worker setup and configuration instructions, and connect an existing worker when its URL and credentials are available.

## Asset and job API

The new service owns asset IDs, immutable input snapshots, job records, and artifact IDs. Browser requests never specify worker filesystem paths or arbitrary commands.

| Route | Purpose |
| --- | --- |
| `POST /api/motion/assets` | Register an image, native rigged asset, or current-rig snapshot; return an upload target |
| `GET /api/motion/assets/:id` | Read preprocessing state, joint labels, facing information, and available trained DIMO motions |
| `POST /api/motion/assets/:id/review` | Submit reviewed UniMate labels and facing information |
| `POST /api/motion/jobs` | Enqueue an allowlisted model operation against an asset ID |
| `GET /api/motion/jobs/:id` | Return state, processing stage, progress details, errors, and available artifacts |
| `POST /api/motion/jobs/:id/cancel` | Cancel queued or running work |
| `GET /api/motion/artifacts/:id` | Authorize artifact download or return a short-lived download URL |

The worker persists its queue and stage results. Job states include `queued`, `running`, `needs_review`, `succeeded`, `failed`, and `cancelled`. Progress reports the current stage and available upstream counts rather than inventing elapsed-time estimates. Restarting the worker marks interrupted subprocesses accurately and allows explicit stage resume.

Authenticate before accepting uploads, starting jobs, or accessing artifacts. Keep worker credentials server-side. A deployment without existing user accounts can use an access token supplied when connecting the editor; do not embed a shared compute credential in the frontend build. Large assets upload directly to an authorized worker upload target.

Validate file types, decoded image sizes, rig topology, operation parameters, and upload sizes. Generate job-scoped directories and use argument arrays for subprocesses. Constrain artifacts to those directories. Cancellation terminates the relevant subprocess tree and cannot publish a later result as successful.

## UniMate path

Support native rigged GLB and FBX uploads through upstream `data_process.rig_preprocess`. The first preprocessing pass stops for label and facing review. Display its annotated preview and allow corrections before continuing. Retain original-to-canonical joint correspondence and scale/orientation metadata.

For current 2D artwork, build a planar rigged asset from the rest skeleton and existing mesh ownership. Preserve stable bone IDs through explicit metadata. Treat planar lifting and projection as experimental until demonstrated on representative GRK assets; native 3D input provides the upstream-supported path. Do not infer full hidden 3D anatomy from a flat image.

Invoke `python -m unimate.inference.sample` with job-specific asset, prompt, seed, repetition count, and output directory. Read limits and sample length from the configured checkpoint. The recommended v3 model uses a 60-frame generation window; expansion handles longer sequences.

In-betweening and joint editing require a real source motion clip in the asset's feature layout. Convert the active GRK clip through the same rig correspondence and canonicalization, rather than passing only a list of selected timestamps. Validate the source window, retained frame indices, and joint-name matches. The three constrained sampling modes are mutually exclusive.

Use the upstream motion decoder and mesh animation path for native results. Convert mapped joints to GRK local angles with an explicit projection plane, Y-axis convention, rest calibration, and scale. Preserve fixed GRK bone lengths, pinned joints, angle limits, and the selected retained joints. Reject nonfinite or incompatible outputs. Keep the native result alongside the projected clip because projection loses depth.

## DIMO path

Start from the user's image and motion descriptions. Run the upstream caption, image-to-video, filtering, multi-view generation, and dataset assembly stages in distinct, resumable jobs. Allow a worker-configured local vision-language model or provider; keep provider credentials on the worker. Rejected or empty datasets must produce actionable failures.

Train the object's DIMO model through both training stages. Then train the BERT-to-latent text projector against that object's captions and the saved `motion_order.json`. Language generation cannot be enabled merely because a Gaussian checkpoint exists; the matching text projector is required.

Persist a trained-object manifest containing source hash, dataset shape, frame sampling, training configuration, motion ordering, checkpoint revision, and projector identity. Subsequent rendering, interpolation, language generation, and fitting operations reference that trained object.

Expose the real `test.py` modes: `render`, `interpolation`, `language`, `fit_motion`, and `fit_unaligned_motion`. Fitting requires the upstream multi-view frame layout; describe that requirement in the upload control. Save derived fitting results separately so decoder refinement does not overwrite the original trained object.

Return reference/orbit video previews and model artifacts. A worker render adapter captures RGB and alpha from the Gaussian renderer for transparent PNG frames and sprite-sheet export. Do not remove white foreground details by substituting background-color keying for alpha. Keep DIMO exports identifiable as rendered animation rather than skeletal clips.

## GRK integration points

- Add `src/components/studio/MotionGenerationPanel.tsx` inside the animation tab of `Sidebar.tsx`. On mobile, reuse the existing inspector drawer. Include model selection, prompts, operation-specific controls, source asset selection, progress, cancellation, result preview, and an explicit apply/export action.
- Add focused motion contracts, client transport, and projection helpers under `src/lib/motion/`. Keep model adapters on the worker rather than shipping Python/model files in the frontend.
- Extend `src/store/studio.ts` with validated clip insertion and motion-aware history. Current history snapshots omit clips and the active clip; generated clip application must undo and redo atomically.
- Apply `Keyframe.rootOffset` during playback relative to `restRootPos`. The type and Spine exporter already include root offsets, but current playback only interpolates angles. Capture root offsets when recording poses.
- Associate pending results with an immutable rig fingerprint. If the rig changes while a job runs, preserve the artifact and require remapping rather than applying motion to unrelated bones.
- Preserve imported motion provenance in project JSON: provider, operation, prompt, seed, input fingerprint, upstream revision, checkpoint identity, and artifact references. Old project files continue loading.

## Verification and delivery criteria

1. Run GRK's existing tests, TypeScript check, and production build after implementation.
2. Add meaningful projection fixtures covering joint ordering, handedness, scale, parent-relative angles, angle wrap, root movement, and invalid or stale results.
3. Verify generated clip application and undo/redo, including the active clip, root position, rest pose, and unchanged pixel ownership.
4. Exercise authenticated job lifecycle, stage resume, cancellation, missing dependencies/checkpoints, failed subprocesses, invalid parameters, and artifact authorization without loading model weights in routine CI.
5. Check the mobile flow at a phone viewport: enter a prompt, submit, dismiss the drawer, reopen status, cancel, preview, and apply or export.
6. On a configured GPU worker, run real UniMate generation plus constrained modes using a supported native asset, and validate a representative GRK projection.
7. On a configured GPU worker, run DIMO on a user image through training and projector creation, then render, interpolate, generate from text, and fit a held-out motion. Confirm alpha exports and derived checkpoint preservation.

Integration tests using fixtures or fake subprocesses establish application behavior only. They do not establish actual model quality or end-to-end GPU readiness. This workspace has no NVIDIA device, PyTorch installation, or downloaded model checkpoints; real inference verification requires the configured external worker.

## Published model terms

UniMate's code is MIT, while its released checkpoints are CC BY-NC 4.0. DIMO's code is MIT, while its required Gaussian rasterizers are restricted to non-commercial research and evaluation; other model components have separate terms. Retain upstream notices and model provenance. Commercial game-asset use needs appropriately permitted checkpoints/components or separate permissions.

## Sources inspected

- [UniMate source and applications](https://github.com/Friedrich-M/UniMate)
- [UniMate custom-rig preprocessing](https://github.com/Friedrich-M/UniMate/tree/main/data_process/rig_preprocess)
- [UniMate model card](https://huggingface.co/Linzhan/UniMate)
- [DIMO source and applications](https://github.com/Friedrich-M/DIMO)
- [DIMO image-to-dataset pipeline](https://github.com/Friedrich-M/DIMO/tree/main/data_generation)
- [DIMO component licenses](https://github.com/Friedrich-M/DIMO/blob/main/LICENSE)

The next stage after design approval is a written implementation plan and execution-method selection, as required by the Superpowers architectural workflow.
