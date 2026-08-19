import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const prototype = document.querySelector(".prototype");
const loading = document.querySelector("#loading");
const recipesLink = document.querySelector('.navigation a[href="recipes.html"]');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x171614, 11, 24);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const cameraTarget = new THREE.Vector3(0, 0.55, 0);
const shelfZoomPosition = new THREE.Vector3();
const shelfZoomTarget = new THREE.Vector3();

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});

renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
prototype.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff4df, 0x302b25, 2.1));

const keyLight = new THREE.DirectionalLight(0xffe3bf, 4.2);
keyLight.position.set(-3, 6, 5);
keyLight.castShadow = true;
scene.add(keyLight);

let bookshelfModel = null;
let zoomAnimation = null;
let isTransitioning = false;
const bookshelfRestingRotation = Math.PI - THREE.MathUtils.degToRad(30);
const bookshelfSwayAmount = THREE.MathUtils.degToRad(12);
const bookshelfSwaySpeed = 0.00025;
const bookshelfOffset = new THREE.Vector3(1.2, -0.1, 0);

document.body.classList.add("overview");

new GLTFLoader().load(
  "models/bookshelf-final.glb",
  gltf => {
    bookshelfModel = gltf.scene;
    bookshelfModel.scale.setScalar(0.1);
    bookshelfModel.rotation.y = bookshelfRestingRotation;
    bookshelfModel.position.copy(bookshelfOffset);

    bookshelfModel.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    scene.add(bookshelfModel);
    frameBookshelf();

    loading.classList.add("hidden");
    renderer.setAnimationLoop(animate);
  },
  progress => {
    if (!progress.total) return;
    const percentage = Math.round((progress.loaded / progress.total) * 100);
    loading.textContent = `Loading the library… ${percentage}%`;
  },
  error => {
    console.error("Could not load bookshelf:", error);
    loading.classList.add("hidden");
    renderer.setAnimationLoop(animate);
  }
);

function frameBookshelf() {
  if (!bookshelfModel) return;

  const bounds = new THREE.Box3().setFromObject(bookshelfModel);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const verticalDistance = size.y / (2 * Math.tan(verticalFov / 2));
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const horizontalDistance = size.x / (2 * Math.tan(horizontalFov / 2));
  const distance = Math.max(verticalDistance, horizontalDistance) * 1.8;
  const homepageOffset = size.x * 0.7;

  camera.position.set(
    centre.x + homepageOffset - bookshelfOffset.x,
    centre.y - bookshelfOffset.y,
    centre.z + distance
  );
  cameraTarget.set(
    centre.x + homepageOffset - bookshelfOffset.x,
    centre.y - bookshelfOffset.y,
    centre.z
  );
  camera.lookAt(cameraTarget);

  shelfZoomTarget.set(
    bounds.min.x + size.x * 0.721,
    bounds.min.y + size.y * 0.5275 - 0.05,
    centre.z
  );

  shelfZoomPosition.set(
    shelfZoomTarget.x,
    shelfZoomTarget.y,
    shelfZoomTarget.z + distance * 0.146
  );
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function startRecipesTransition(event) {
  if (!bookshelfModel) return;

  event.preventDefault();
  if (isTransitioning) return;

  isTransitioning = true;
  document.body.classList.remove("overview");

  zoomAnimation = {
    startTime: performance.now(),
    duration: 2200,
    startPosition: camera.position.clone(),
    endPosition: shelfZoomPosition.clone(),
    startTarget: cameraTarget.clone(),
    endTarget: shelfZoomTarget.clone(),
    startRotation: bookshelfModel.rotation.y,
    endRotation: Math.PI
  };

  window.setTimeout(() => {
    window.location.href = recipesLink.href;
  }, zoomAnimation.duration);
}

recipesLink?.addEventListener("click", startRecipesTransition);

function updateZoom(now) {
  if (!zoomAnimation) return;

  const progress = THREE.MathUtils.clamp(
    (now - zoomAnimation.startTime) / zoomAnimation.duration,
    0,
    1
  );
  const eased = easeInOutCubic(progress);

  camera.position.lerpVectors(
    zoomAnimation.startPosition,
    zoomAnimation.endPosition,
    eased
  );
  cameraTarget.lerpVectors(
    zoomAnimation.startTarget,
    zoomAnimation.endTarget,
    eased
  );
  bookshelfModel.rotation.y = THREE.MathUtils.lerp(
    zoomAnimation.startRotation,
    zoomAnimation.endRotation,
    eased
  );
}

function animate(now) {
  if (bookshelfModel && !isTransitioning) {
    bookshelfModel.rotation.y =
      bookshelfRestingRotation +
      Math.sin(now * bookshelfSwaySpeed) * bookshelfSwayAmount;
  }

  updateZoom(now);
  camera.lookAt(cameraTarget);
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  if (!isTransitioning) frameBookshelf();
});
