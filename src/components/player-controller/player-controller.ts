import {Component, PhysXComponent} from '@wonderlandengine/api';
import {typename} from '../../constants.js';
import {vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';

/**
 * This component is attached to the player object and is responsible for
 * controlling the player's movement.
 *
 * It needs to have a physx component attached to it. And be on the root of the
 * player hierarchy.
 *
 * The player-controller is the main component for controlling the player's movement and
 * uses other components to implement the various things.
 *
 *
 * @see {@link InputBridge} for handling input from various input providers
 * @see {@link LocomotionSelector} for selecting the type of locomotion to use
 * @see {@link TeleportLocomotion} for teleport locomotion
 * @see {@link SmoothLocomotion} for smooth locomotion
 * @see {@link PlayerRotate} for rotating the player
 * @see {@link HeadCollissionMove} for pushing the player backwards when their head collides with a wall / object
 * @see {@link HeadCollissionFade} for fading to black when the player's head collides with a wall / object
 */
export class PlayerController extends Component {
    static TypeName = typename('player-controller');

    private physxComponent!: PhysXComponent;
    private headForward: vec3 = [0, 0, 0];
    private activeCamera!: ActiveCamera;

    init() {}

    start() {
        const tempPhysx = this.object.getComponent(PhysXComponent);
        if (!tempPhysx) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a Physx`
            );
        }
        this.physxComponent = tempPhysx;

        const tempActiveCamera = this.object.getComponent(ActiveCamera);
        if (!tempActiveCamera) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a ActiveCamera`
            );
        }
        this.activeCamera = tempActiveCamera;
    }

    update() {}

    move(movement: vec3) {
        // Move according to headObject Forward Direction
        //vec3.normalize(movement, movement);
        // movement[0] *= this.moveSpeed;
        // movement[2] *= this.moveSpeed;

        const currentCamera = this.activeCamera.getActiveCamera();
        currentCamera.getForwardWorld(this.headForward);

        // Combine direction with headObject
        vec3.transformQuat(movement, movement, currentCamera.getTransformWorld());

        //  if (this.moveActive) {
        //      if (this.up || this.down || this.left || this.right) {
        // Do not move on Y axis
        movement[1] = 0;
        // Add force to Physx Component to move the player
        this.physxComponent.addForce(movement);
    }

    rotate() {}
}
