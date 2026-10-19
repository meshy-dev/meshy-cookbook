// Play the Meshy character in a three.js scene: WASD or the arrow keys run, Space attacks.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const MODEL = "models/character.glb"; // written by npm run optimize, served from public/
const RUN_SPEED = 2.2; // metres per second: how fast the run clip's feet push back on the ground, so they don't slide
const FADE = 0.2; // seconds to blend from one clip into the next

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd1e5);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 4);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x9aa58a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground, new THREE.GridHelper(40, 40, 0x6f7a62, 0x6f7a62));
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

// The file is meshopt-compressed, so the loader needs the meshopt decoder.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync(MODEL);
// The clips keep the order of the action ids: idle, run, attack.
const [idleClip, runClip, attackClip] = gltf.animations;

// Meshy rigs the character standing on y = 0 at the height_meters it was rigged with, facing +Z.
const player = gltf.scene;
scene.add(player);
// A second copy needs its own skeleton. SkeletonUtils.clone() makes one. Object3D.clone() keeps
// using the original's skeleton, so that copy can't play clips of its own.
const guard = SkeletonUtils.clone(gltf.scene);
guard.position.set(-2, 0, -2);
scene.add(guard);

const mixer = new THREE.AnimationMixer(player);
const idle = mixer.clipAction(idleClip);
const run = mixer.clipAction(runClip);
const attack = mixer.clipAction(attackClip);
attack.setLoop(THREE.LoopOnce, 1);
attack.clampWhenFinished = true;
const guardMixer = new THREE.AnimationMixer(guard);
guardMixer.clipAction(idleClip).play();

let current = idle;
current.play();
function play(next) {
  if (next === current) return;
  next.reset().play();
  current.crossFadeTo(next, FADE, false);
  current = next;
}
// When the attack ends, go back to idle; the next frame switches to run if a key is held.
mixer.addEventListener("finished", () => play(idle));

const keys = new Set();
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space" && !event.repeat) play(attack);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear()); // a key released in another window never sends keyup here
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const held = (...codes) => (codes.some((code) => keys.has(code)) ? 1 : 0);
const direction = new THREE.Vector3();
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const delta = timer.getDelta();
  direction.set(held("KeyD", "ArrowRight") - held("KeyA", "ArrowLeft"), 0, held("KeyS", "ArrowDown") - held("KeyW", "ArrowUp"));
  if (current !== attack) {
    if (direction.lengthSq() > 0) {
      // The run clip is an in-place clip, so the code moves the character.
      direction.normalize();
      player.position.addScaledVector(direction, RUN_SPEED * delta);
      player.rotation.y = Math.atan2(direction.x, direction.z);
      play(run);
    } else {
      play(idle);
    }
  }
  mixer.update(delta);
  guardMixer.update(delta);
  camera.position.set(player.position.x, 2.6, player.position.z + 4.2);
  camera.lookAt(player.position.x, 1, player.position.z);
  renderer.render(scene, camera);
});
