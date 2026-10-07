# Android native UniMate and DIMO for Bendy / GRK

Status: revised draft for user review. Product implementation has not started.

## Goal and agreed constraints

Add the actual UniMate and DIMO capabilities to GRK for local use on a Samsung S24 Ultra. The user selected actual models, then replaced the proposed PyTorch/server GPU stack with an Android native stack. This revision supersedes the remote-worker design.

The installed application performs inference and motion processing on the phone. Its execution path uses Kotlin, Android NDK C++, native model runtimes, and Android graphics/media APIs. It contains no Python interpreter, PyTorch/libtorch, CUDA, conda environment, or Termux dependency. A remote inference service is not part of the normal workflow.

Original checkpoint export and quantization may use upstream Python/PyTorch tools on a build machine. They produce portable model packs and numerical reference fixtures; they do not ship in the APK or run during phone generation. The replacement concerns the installed runtime, not the original checkpoint format.

The target remains `jcltd303-hub/grk`, inferred from Bendy context. Preserve the mobile editor, exclusive pixel ownership, joint limits, undo/redo, and Spine export. Package the current editor in a native Android application while moving model execution into native code.

Inspected revisions: GRK `3503870904f413067499bad369ca381f16eadef0`; UniMate `004d787452e0bf8253d669d6e7b26c2064055cad`; DIMO `0c5938689071eda305d6625160e5d6e032a0ff9a`.

## Native stack

| Existing responsibility | Android native replacement |
| --- | --- |
| Python orchestration | Kotlin lifecycle and local job scheduler |
| PyTorch neural inference | ONNX Runtime C++ built for Android ARM64 |
| CUDA neural execution | Qualcomm QNN HTP/NPU for validated quantized graphs; QNN GPU for compatible float graphs; explicit ARM CPU fallback |
| Transformers text encoding | Exported encoder graphs and native SentencePiece/WordPiece tokenizers with matching pooling |
| NumPy/SciPy conditioning and geometry | C++ tensor buffers, linear algebra, graph operations, and forward kinematics |
| torchdiffeq sampling | C++ flow integrator, classifier-free guidance, constraint replacement, and motion decoding |
| CUDA Gaussian rasterizers | New Vulkan compute renderer with a CPU reference for verification |
| Python image/video handling | Android image APIs, PNG export, MediaCodec, and MediaMuxer |
| Remote worker API | Typed asynchronous Android bridge and JNI calls |

Recommend ONNX Runtime C++ plus QNN because it permits a native correctness baseline and measured accelerator partitioning. This does not establish that these exact model graphs are already convertible. Direct QNN C++ is an alternative with fewer runtime layers and more model-specific fallback code. LiteRT is another native alternative, but adds a conversion path whose operator coverage must be demonstrated.

Build and package Android QNN libraries; a Windows QNN Python package is not an Android dependency. Match runtime/provider/context/SoC versions, and verify ARM64 native libraries support Android's 16 KiB page-size requirements.

## Android application and local jobs

Add an `android/` host application and NDK library. Bundle GRK's production frontend as local assets using Android's local-content APIs. A typed bridge supplies native capabilities, model-pack import, asset preparation, job submission, progress, cancellation, and artifact access. Restrict the bridge to the bundled editor's trusted origin.

Model files and large buffers stay in native/app storage. Exchange IDs and compact results through the bridge rather than model weights or raw video frames. No public localhost server or compute credential is required. Import through Android's Storage Access Framework; export through system file/media APIs. Persist jobs, model manifests, and resumable stage boundaries in app-private storage.

Run inference off the UI thread and serialize heavy jobs. Release unused sessions and GPU buffers between text encoding, denoising, and rendering. Cache small embeddings by tokenizer/checkpoint identity. Job states include `queued`, `preparing`, `needs_review`, `running`, `paused`, `succeeded`, `failed`, `cancelled`, and `unsupported`.

Report actual stages and counts. Cancellation interrupts native loops and cannot publish later success. Lifecycle interruption must be visible and resumable rather than implying unlimited background execution. Monitor Android memory-pressure and thermal signals; reduce buffers or pause before resource exhaustion. Determine scene sizes, memory budgets, and timing from handset measurements rather than nominal total RAM.

## Model packs and conversion

A versioned pack contains native graphs or QNN contexts, tokenizer assets, normalization statistics, skeleton vocabulary/conditioning metadata, licenses, and numerical fixtures. Its manifest records layouts, static shape profiles, sample window/frame rate, solver configuration, joint budget, precision, source/checkpoint hashes, provider compatibility, and runtime version.

DIMO packs also contain canonical Gaussian parameters, key points, motion ordering, latent codes, and a matching object-specific text projector when available. Parse JSON and typed arrays on the phone; do not load pickle dictionaries or PyTorch checkpoints in the app.

QNN requires fixed shapes and supported operators. Export neural forward passes; keep variable loops and geometry in C++. Lower attention to compatible graph operations where needed. Preserve graph biases, masks, RoPE, embeddings, AdaLN, prefix frames, and exact checkpoint conditioning. Compute static skeleton graph data on the CPU.

Establish a native CPU baseline before quantization. Calibrate candidate precisions with representative rigs, prompts, timesteps, and motions. Verify both numerical and motion quality. Record actual provider assignment; diagnostic runs disable CPU fallback when verifying an all-NPU claim. A backend label alone does not prove acceleration.

Reference fixtures use identical input/noise tensors and time schedules. A matching seed alone does not prove parity between different random-number generators. Record the phone RNG version for reproducible jobs.

## UniMate native generation

Export the trained denoiser and its exact frozen text encoder. Implement matching native tokenization, masking, and pooling. Cache reviewed joint-label embeddings and encode new labels locally. Port flow sampling, guidance, normalization, motion recovery, and forward kinematics to C++. Read the solver from the pack; reduced-step modes require separate quality measurements.

Expose genuine prompt generation, in-betweening, editing that retains selected joints, and prompt-sequence expansion. Generate variants sequentially to bound memory. Constrained modes remain mutually exclusive per sampling job. Convert the active GRK clip into canonical features and retain known constraints during the relevant solver evaluations, not merely by changing final displayed angles.

Port rest-pose normalization, joint vocabulary/facing review, and correspondence into native preprocessing. There is no on-device Blender dependency. Current 2D rigs use a planar skeleton with stable bone IDs. Native GLB import is a second path; other formats require verified native importers.

Demonstrate planar rigs on representative artwork. Keep explicit projection plane, axis convention, scale, and rest calibration; flat images do not supply hidden 3D anatomy. Reject unsupported joint counts and invalid outputs. Return editable clips with parent-relative angles and root offsets while preserving lengths, pins, limits, and pixel ownership. Retain the 3D motion artifact and use existing Spine export for mapped clips.

## DIMO native inference and rendering

Convert a real trained DIMO object to a native pack while preserving its learned latent space and deformation decoder. Run the decoder in bounded chunks. Port key-point deformation and quaternion math to C++. Implement Gaussian projection, covariance handling, tile binning, depth ordering, colors, opacity, and alpha compositing in Vulkan.

Compare decoder and renderer outputs to upstream fixtures, including camera conventions and rectangular viewports. Expose rendering, orbit/camera previews, and latent interpolation. Language guidance additionally requires the matching BERT encoder/tokenizer and object-specific projector. Packs without the projector cannot advertise language generation.

Export RGBA PNG frames and sprite sheets, and encode ordinary video previews using Android media APIs. Do not claim transparency in codecs that cannot preserve it. DIMO's Gaussian scene and unsupervised key points do not provide a named skeletal hierarchy; its initial outputs are rendered animation assets rather than automatically generated Spine rigs.

## Full DIMO training and image-to-motion

New-image object learning and unseen-motion fitting require an additional native training port. The upstream pipeline generates video/multi-view data, trains a Gaussian scene and decoder in two stages, and trains a text projector. Its default video/multi-view configuration recommends substantially more GPU memory than one phone app has available. Exporting inference graphs does not implement those steps.

Keep full local functionality as a separate deliverable with explicit requirements:

1. Convert and device-test image-to-video and multi-view model packs; measure memory and quality. Lower precision/resolution is not proof that the default pipeline fits. Preserve the frame/view layout expected by DIMO.
2. Implement Gaussian forward/backward rendering, optimizer state, densification/pruning, and relevant image, geometry, ARAP, and latent losses in native code. QNN is an inference API. Android runtimes have some native training APIs, but they do not automatically replace DIMO's custom CUDA gradients.
3. Stream training images/masks through bounded caches and save stage/optimizer checkpoints.
4. Implement decoder/projector training or verified native training graphs with the necessary custom gradients. Preserve motion ordering and caption-to-latent pairing.
5. Port aligned and unaligned fitting; store derived models without overwriting the original learned object.

Until those requirements pass on the phone, new-image training and fitting are unavailable. Playback of a converted object is not full image-to-motion generation. A preset, invented model, remote job, or different motion algorithm cannot silently replace the requested models.

The delivery sequence is: native Android foundation plus actual UniMate generation; actual DIMO inference/rendering for converted objects; independently verified full native DIMO training. These stages retain the complete goal while identifying unfinished capabilities clearly.

## GRK integration

- Add one motion panel in the existing animation tab and reuse the mobile inspector drawer. Show operations from native capabilities and installed packs, with concrete reasons for unavailable operations.
- Add a typed local runtime interface under `src/lib/motion/` and its Android bridge. Browser-only GRK retains existing editing/export; native generation requires the Android host.
- Extend `src/store/studio.ts` with validated clip insertion and atomic history of animation clips and active selection. Current snapshots omit clips.
- Apply `Keyframe.rootOffset` relative to `restRootPos` during playback and capture it during recording; existing types/Spine exports already support root offsets.
- Bind results to immutable source/rig fingerprints. Retain stale artifacts and require remapping before applying them to changed bones.
- Export pack/checkpoint hashes, provider, prompt, seed/RNG version, operation, projection settings, and source fingerprint. Older projects continue loading.

## Verification and completion

1. Run existing GRK tests, TypeScript check, and production build after implementation.
2. Verify native conditioning, text pooling, guidance, solver steps, constraint retention, decoding, projection, root motion, and stale-result rejection against source fixtures.
3. Verify clip apply/undo/redo and exports without changing rest geometry or pixel ownership.
4. Build the ARM64 APK and verify JNI loading, trusted editor bridge, pack import, cancellation, lifecycle interruption, artifact export, and native page-size compatibility.
5. Run actual UniMate packs on the S24 Ultra. Measure provider assignment, wall time, peak resident memory, loading, thermal behavior, and real-prompt motion quality.
6. Run real DIMO packs on the phone. Verify decoder/RGBA rendering parity, interpolation, matching-projector language guidance, cameras, and frame/video export.
7. Independently verify full native DIMO learning/fitting before enabling it: gradient correctness, training behavior, resume, projector pairing, and bounded dataset memory.

This workspace currently has no Android SDK/NDK toolchain, connected handset/ADB, or converted UniMate/DIMO packs. Source inspection and runtime documentation establish a proposed port, not a working APK, NPU compatibility, measured performance, or completed generation.

## Model and runtime terms

Retain upstream terms and provenance. UniMate code is MIT and released checkpoints are CC BY-NC 4.0. DIMO code is MIT; original Gaussian rasterizers have non-commercial restrictions, and video/matting weights have separate terms. A newly written renderer does not change other components' licenses. Check Qualcomm redistribution terms when packaging its libraries.

## Primary sources

- [UniMate source](https://github.com/Friedrich-M/UniMate)
- [UniMate model card](https://huggingface.co/Linzhan/UniMate)
- [DIMO source](https://github.com/Friedrich-M/DIMO)
- [DIMO data generation](https://github.com/Friedrich-M/DIMO/tree/main/data_generation)
- [DIMO component licenses](https://github.com/Friedrich-M/DIMO/blob/main/LICENSE)
- [ONNX Runtime QNN provider](https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html)
- [ONNX Runtime Android build](https://onnxruntime.ai/docs/build/android.html)
- [ONNX Runtime Android training example](https://onnxruntime.ai/docs/tutorials/on-device-training/android-app.html)
- [Qualcomm QNN overview](https://docs.qualcomm.com/nav/home/QNN_general_overview.html?product=924033590759186372)
- [Android Vulkan](https://developer.android.com/ndk/guides/graphics)
- [Android local WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [Android 16 KiB page-size support](https://developer.android.com/guide/practices/page-sizes)
- [LiteRT alternative](https://developers.google.com/edge/litert/overview)

After revised-design approval, prepare the implementation plan and execution-method selection required by the Superpowers architectural workflow. The first plan covers the native foundation and UniMate; DIMO's inference/rendering and training ports have separate completion criteria.
