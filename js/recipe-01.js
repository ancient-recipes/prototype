import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.querySelector("#bookScene");
const loading = document.querySelector("#loading");
const bookControls = document.querySelector("#bookControls");
const previousButton = document.querySelector("#previousPage");
const nextButton = document.querySelector("#nextPage");
const zoomOutButton = document.querySelector("#zoomOut");
const zoomInButton = document.querySelector("#zoomIn");
const backgroundMusic = document.querySelector("#backgroundMusic");
const musicButton = document.querySelector("#musicButton");
const pageFlipSound = document.querySelector("#pageFlipSound");
const bookOpenSound = document.querySelector("#bookOpenSound");
const bookCloseSound = document.querySelector("#bookCloseSound");

backgroundMusic.volume = 0.07;
pageFlipSound.volume = 0.3;
bookOpenSound.volume = 0.35;
bookCloseSound.volume = 0.35;

function playPageFlipSound() {
  pageFlipSound.currentTime = 0;
  pageFlipSound.play().catch(() => {});
}

function playBookOpenSound() {
  bookOpenSound.currentTime = 0;
  bookOpenSound.play().catch(() => {});
}

function playBookCloseSound() {
  bookCloseSound.currentTime = 0;
  bookCloseSound.play().catch(() => {});
}

async function startBackgroundMusic() {
  if (backgroundMusic.muted) return;

  try {
    await backgroundMusic.play();
  } catch {
  }
}

function updateMusicButton() {
  const muted = backgroundMusic.muted;
  musicButton.classList.toggle("muted", muted);
  musicButton.setAttribute("aria-pressed", String(muted));
  musicButton.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
  musicButton.title = muted ? "Unmute music" : "Mute music";
}

musicButton.addEventListener("click", () => {
  backgroundMusic.muted = !backgroundMusic.muted;
  updateMusicButton();
  if (!backgroundMusic.muted) startBackgroundMusic();
});

startBackgroundMusic();
addEventListener("pointerdown", startBackgroundMusic, { once: true });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7.5, 6.5);
camera.up.set(0, 1, 0);
const cameraTarget = new THREE.Vector3(0, 0, 0);
camera.lookAt(cameraTarget);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffe8ca, 0x261007, 2.2));

const overheadLight = new THREE.DirectionalLight(0xffd7a2, 4.5);
overheadLight.position.set(-3, 8, 4);
scene.add(overheadLight);

const warmLight = new THREE.PointLight(0xd66b28, 28, 18);
warmLight.position.set(4, 4, -3);
scene.add(warmLight);

const bookHolder = new THREE.Group();
bookHolder.rotation.y = 0;
bookHolder.rotation.x = THREE.MathUtils.degToRad(40); //tilts book back
scene.add(bookHolder);

const bookScreenOffsetZ = -1.8;

let book = null;
let mixer = null;
let actions = {};
let bookIsOpen = false;
let animationPlaying = false;
let pageNumber = 1;
const lastPageNumber = 2;
const clock = new THREE.Clock();

// Zoom and drag state
let isZoomed = false;
let initialCameraPos = new THREE.Vector3();
let dragStartX = 0;
let dragStartY = 0;
let panX = 0;
let panY = 0;
let isDragging = false;
let zoomLevel = 0;
const maxZoomLevel = 6;
const zoomStep = 0.1;
const zoomCameraPos = new THREE.Vector3();
const initialCameraTarget = new THREE.Vector3();
const dragRight = new THREE.Vector3();
const dragUp = new THREE.Vector3();
const dragBaseCameraPos = new THREE.Vector3();
const dragBaseTarget = new THREE.Vector3();

new GLTFLoader().load(
  "models/animset_06.glb",
  gltf => {
    book = gltf.scene;
    book.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach(material => {
        if (!material) return;
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      });
    });
    bookHolder.add(book);

    mixer = new THREE.AnimationMixer(book);
    actions = Object.fromEntries(
      gltf.animations.map(clip => [clip.name.toLowerCase(), mixer.clipAction(clip)])
    );

    const initialAction = findAction("book_open");
    if (initialAction) {
      initialAction.play();
      initialAction.time = initialAction.getClip().duration;
      mixer.update(0);
    }

    frameBook();

    if (initialAction) {
      initialAction.time = 0;
      mixer.update(0);
      initialAction.paused = true;
    }
    loading.classList.add("hidden");
    updateControls();
    renderer.setAnimationLoop(animate);
  },
  progress => {
    if (!progress.total) return;
    const percentage = Math.round((progress.loaded / progress.total) * 100);
    loading.textContent = `Preparing the recipe book… ${percentage}%`;
  },
  error => {
    console.error("Unable to load the recipe book:", error);
    loading.textContent = "Unable to load the recipe book.";
  }
);

function frameBook() {
  bookHolder.scale.setScalar(1);
  bookHolder.position.set(0, 0.9, 0);
  bookHolder.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(bookHolder);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const desiredWidth = innerWidth < 720 ? 4.8 : 8.4;
  const scale = desiredWidth / Math.max(size.x, size.z);

  bookHolder.scale.setScalar(scale);
  bookHolder.position.set(
    -centre.x * scale,
    -1.2 - bounds.min.y * scale,
    -centre.z * scale + bookScreenOffsetZ
  );
}

function findAction(name) {
  if (actions[name]) return actions[name];
  const key = Object.keys(actions).find(actionName => actionName.includes(name));
  return key ? actions[key] : null;
}

function playAnimation(name) {
  const action = findAction(name);
  if (!action || animationPlaying) return Promise.resolve(false);

  animationPlaying = true;
  updateControls();
  mixer.stopAllAction();
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  return new Promise(resolve => {
    const onFinished = event => {
      if (event.action !== action) return;
      mixer.removeEventListener("finished", onFinished);
      animationPlaying = false;
      updateControls();
      resolve(true);
    };
    mixer.addEventListener("finished", onFinished);
  });
}

async function openBook() {
  if (!book || bookIsOpen || animationPlaying) return;
  playBookOpenSound();
  const played = await playAnimation("book_open");
  if (!played) return;
  bookIsOpen = true;
  updateControls();
}

async function closeBook() {
  if (!book || !bookIsOpen || animationPlaying) return;
  playBookCloseSound();
  const played = await playAnimation("book_close");
  if (!played) return;
  if (isZoomed) exitZoom();
  bookIsOpen = false;
  pageNumber = 1;
  updateControls();
}

async function nextPage() {
  if (!bookIsOpen || animationPlaying) return;
  if (pageNumber >= lastPageNumber) return;

  playPageFlipSound();
  if (await playAnimation("page_next")) {
    pageNumber += 1;
    updateControls();
  }
}

async function previousPage() {
  if (!bookIsOpen || animationPlaying || pageNumber <= 1) return;
  playPageFlipSound();
  if (await playAnimation("page_previous")) {
    pageNumber -= 1;
    updateControls();
  }
}

function updateControls() {
  const ready = Boolean(book && mixer) && !animationPlaying;
  bookControls.classList.toggle("visible", bookIsOpen);
  previousButton.disabled = !ready || !bookIsOpen;
  nextButton.disabled = !ready || (bookIsOpen && pageNumber >= lastPageNumber);
  previousButton.setAttribute(
    "aria-label",
    bookIsOpen && pageNumber <= 1 ? "Close book" : "Previous page"
  );
  nextButton.setAttribute(
    "aria-label",
    bookIsOpen ? "Next page" : "Open book"
  );
  zoomOutButton.disabled = !book || zoomLevel <= 0;
  zoomInButton.disabled = !book || zoomLevel >= maxZoomLevel;
}

previousButton.addEventListener("click", () => {
  if (pageNumber <= 1) closeBook();
  else previousPage();
});
nextButton.addEventListener("click", () => {
  if (!bookIsOpen) openBook();
  else nextPage();
});
zoomOutButton.addEventListener("click", () => changeZoom(-1));
zoomInButton.addEventListener("click", () => changeZoom(1));

function enterZoom(event) {
  if (isZoomed) return;
  isZoomed = true;
  isDragging = false;
  initialCameraPos.copy(camera.position);
  initialCameraTarget.copy(cameraTarget);
  dragRight.setFromMatrixColumn(camera.matrixWorld, 0);
  dragUp.setFromMatrixColumn(camera.matrixWorld, 1);
  dragStartX = event?.clientX ?? innerWidth / 2;
  dragStartY = event?.clientY ?? innerHeight / 2;
  panX = 0;
  panY = 0;
}

function setZoomLevel(level) {
  zoomLevel = Math.max(0, Math.min(maxZoomLevel, level));
  const zoomFactor = 1 - (zoomLevel / maxZoomLevel) * 0.6;
  zoomCameraPos.copy(initialCameraPos).multiplyScalar(zoomFactor);
  const cameraOffset = new THREE.Vector3()
    .addScaledVector(dragRight, panX)
    .addScaledVector(dragUp, panY);
  camera.position.copy(zoomCameraPos).add(cameraOffset);
  cameraTarget.copy(initialCameraTarget).add(cameraOffset);
  camera.lookAt(cameraTarget);
  camera.updateProjectionMatrix();
  if (zoomLevel === 0) exitZoom();
  updateControls();
}

function changeZoom(direction) {
  if (!book) return;
  if (!isZoomed) enterZoom();
  setZoomLevel(zoomLevel + direction);
}

function startDrag(event) {
  if (!book || animationPlaying) return;
  if (!isZoomed) {
    dragBaseCameraPos.copy(camera.position);
    dragBaseTarget.copy(cameraTarget);
    zoomCameraPos.copy(camera.position);
    initialCameraTarget.copy(cameraTarget);
    dragRight.setFromMatrixColumn(camera.matrixWorld, 0);
    dragUp.setFromMatrixColumn(camera.matrixWorld, 1);
    panX = 0;
    panY = 0;
  }
  isDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
}

function handleDrag(event) {
  if (!isDragging) return;
  
  const deltaX = event.clientX - dragStartX;
  const deltaY = event.clientY - dragStartY;
  
  panX -= deltaX * 0.01;
  panY += deltaY * 0.01;
  
  if (isZoomed) {
    setZoomLevel(zoomLevel);
  } else {
    const cameraOffset = new THREE.Vector3()
      .addScaledVector(dragRight, panX)
      .addScaledVector(dragUp, panY);
    camera.position.copy(dragBaseCameraPos).add(cameraOffset);
    cameraTarget.copy(dragBaseTarget).add(cameraOffset);
    camera.lookAt(cameraTarget);
  }
  
  dragStartX = event.clientX;
  dragStartY = event.clientY;
}

function stopDrag() {
  isDragging = false;
}

renderer.domElement.addEventListener("mousedown", startDrag);
document.addEventListener("mousemove", handleDrag);
document.addEventListener("mouseup", stopDrag);

function exitZoom() {
  isZoomed = false;
  isDragging = false;
  zoomLevel = 0;
  camera.position.copy(initialCameraPos);
  cameraTarget.copy(initialCameraTarget);
  camera.lookAt(cameraTarget);
  camera.updateProjectionMatrix();
  panX = 0;
  panY = 0;
}


addEventListener("keydown", event => {
  if (event.key === "ArrowLeft") previousPage();
  if (event.key === "ArrowRight") nextPage();
  if (event.key === "Escape") {
    if (isZoomed) exitZoom();
    else closeBook();
  }
  if ((event.key === "Enter" || event.key === " ") && !bookIsOpen) openBook();
});

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  mixer?.update(delta);
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  if (book) frameBook();
});
