import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const prototype = document.querySelector(".prototype");
const loading = document.querySelector("#loading");
const startRecipeButton = document.querySelector("#startRecipeButton");

document.body.classList.add("overview");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x171614, 10, 22);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const carouselCameraDistance = 8.2;
camera.position.set(0, 0, carouselCameraDistance);
camera.lookAt(0, 0, 0);

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

const bookGroup = new THREE.Group();
scene.add(bookGroup);

const books = [];
const bookCount = 10;
const carouselOffsetX = 0.45;
const carouselCameraBaseY = -1.06;
const shelfTop = -1.3;
let targetIndex = 5;
let visualIndex = targetIndex;
let selectedIndex = targetIndex;
let lastFrameTime = performance.now();
let hoveredBookIndex = null;
let activeBookIndex = null;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function updateStartRecipeButton() {
  const shouldShow = activeBookIndex === 4;
  startRecipeButton.classList.toggle("visible", shouldShow);
  startRecipeButton.setAttribute("aria-hidden", String(!shouldShow));
  startRecipeButton.tabIndex = shouldShow ? 0 : -1;
}

const bookSources = [];

function prepareBookModel(scene) {
  let hasMesh = false;
  scene.traverse(child => {
    if (child.isMesh) hasMesh = true;
  });
  if (!hasMesh) return null;

  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  scene.scale.setScalar(2.7 / Math.max(size.x, size.y, size.z));
  return scene;
}

function createBooks() {
  for (let index = 0; index < bookCount; index += 1) {
    const pivot = new THREE.Group();
    pivot.userData.bookIndex = index;
    
    const model = bookSources[index].clone(true);

    model.rotation.set(0, Math.PI / 2, Math.PI / 2);
    model.updateWorldMatrix(true, true);
    let rotatedBounds = new THREE.Box3().setFromObject(model);
    const rotatedSize = rotatedBounds.getSize(new THREE.Vector3());

    if (rotatedSize.x > rotatedSize.y) {
      model.rotateZ(Math.PI / 2);
      model.updateWorldMatrix(true, true);
      rotatedBounds = new THREE.Box3().setFromObject(model);
    }

    model.rotateZ(Math.PI);
    model.updateWorldMatrix(true, true);
    rotatedBounds = new THREE.Box3().setFromObject(model);

    const centre = rotatedBounds.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -rotatedBounds.min.y, -centre.z);


    if (index === 0) {
      const bookHeight = rotatedBounds.getSize(new THREE.Vector3()).y;
      const bookCentreY = carouselCameraBaseY + bookHeight / 2;
      camera.position.set(0, bookCentreY, carouselCameraDistance);
      camera.lookAt(0, bookCentreY, 0);
    }

    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.bookIndex = index;
    });

    pivot.add(model);
    bookGroup.add(pivot);
    books.push(pivot);
  }

  layoutBooks(true);
  loading.classList.add("hidden");
  renderer.setAnimationLoop(animate);
}

async function loadShelfModels() {
  const loader = new GLTFLoader();

  try {
    const models = await Promise.all(
      Array.from({ length: bookCount }, async (_, index) => {
        const gltf = await loader.loadAsync(`models/book-${index + 1}.glb`);
        const model = prepareBookModel(gltf.scene);
        if (!model) throw new Error(`book-${index + 1}.glb contains no mesh`);
        return model;
      })
    );

    bookSources.push(...models);
    createBooks();
  } catch (error) {
    console.error("Could not load all recipe books:", error);
    loading.textContent = "Could not load the recipe books.";
  }
}

loadShelfModels();

function layoutBooks(immediate = false) {
  const spacing = innerWidth < 720 ? 0.6 : 0.86;
  const movement = immediate ? 1 : 0.2;
  const bookshelfForwardOffset = 0.22;

  books.forEach((book, index) => {
    const isHovered = index === hoveredBookIndex;
    const isActive = index === activeBookIndex;
    let targetX = carouselOffsetX + (index - visualIndex) * spacing;
    let targetY = shelfTop;
    let targetZ = bookshelfForwardOffset;
    let targetScale = 1;
    let targetRotation = THREE.MathUtils.degToRad(-90);

    if (isHovered && activeBookIndex === null) targetY += 0.25;

    if (isActive) {
      targetX = 0;
      targetY += 0.15;
      targetZ = 2 + bookshelfForwardOffset;
      targetScale = 1.05;
      targetRotation = THREE.MathUtils.degToRad(-180);
    }

    book.position.x = THREE.MathUtils.lerp(book.position.x, targetX, movement);
    book.position.y = THREE.MathUtils.lerp(book.position.y, targetY, movement);
    book.position.z = THREE.MathUtils.lerp(book.position.z, targetZ, movement);
    book.rotation.y = THREE.MathUtils.lerp(book.rotation.y, targetRotation, movement);
    book.scale.setScalar(THREE.MathUtils.lerp(book.scale.x, targetScale, movement));
  });
}

function animate(now) {
  const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  targetIndex = clamp(targetIndex, 0, bookCount - 1);

  visualIndex += (targetIndex - visualIndex) * (1 - Math.exp(-10 * deltaTime));
  selectedIndex = clamp(Math.round(targetIndex), 0, bookCount - 1);
  layoutBooks();
  renderer.render(scene, camera);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function getBookAtPointer(event) {
  pointer.set(
    (event.clientX / innerWidth) * 2 - 1,
    -(event.clientY / innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(books, true)[0];
  if (!hit) return null;

  let object = hit.object;
  while (object && object.userData.bookIndex === undefined) object = object.parent;
  return object?.userData.bookIndex ?? null;
}

renderer.domElement.addEventListener("pointermove", event => {
  hoveredBookIndex = activeBookIndex === null ? getBookAtPointer(event) : null;
  renderer.domElement.style.cursor = hoveredBookIndex === null ? "grab" : "pointer";
});

renderer.domElement.addEventListener("click", event => {
  const clickedBook = getBookAtPointer(event);

  if (clickedBook === null) {
    activeBookIndex = null;
    updateStartRecipeButton();
    return;
  }

  activeBookIndex = clickedBook;
  updateStartRecipeButton();
});

addEventListener("keydown", event => {
  if (event.key === "Escape") {
    activeBookIndex = null;
    updateStartRecipeButton();
  }
  if (event.key === "ArrowLeft") targetIndex = clamp(selectedIndex - 1, 0, bookCount - 1);
  if (event.key === "ArrowRight") targetIndex = clamp(selectedIndex + 1, 0, bookCount - 1);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  layoutBooks(true);
});
