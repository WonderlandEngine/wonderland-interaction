import {
    Component,
    ForceMode,
    Object3D,
    PhysXComponent,
    property,
} from '@wonderlandengine/api';
import {vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';
import {InputBridge, InputBridgeTypename} from './input-bridge.js';
import {toRad} from '../utils/math.js';

/* Temporaries */
const tempCameraVec = vec3.create();
const tempPlayerVec = vec3.create();
const _vectorA = vec3.create();

export function getRequiredComponents(
    object: Object3D,
    inputBridgeObject: Object3D | null
): {player: PlayerController; inputBridge: InputBridge} {
    const player = object.getComponent(PlayerController);
    if (!player) {
        throw new Error(
            `player-controller(${object.name}): object does not have a PlayerController. This is required.`
        );
    }

    const inputBridge =
        inputBridgeObject?.getComponent(InputBridgeTypename) ||
        object.getComponent(InputBridgeTypename);
    if (!inputBridge) {
        throw new Error(
            `player-controller(${object.name}): object does not have a InputBridge and the inputBridgeObject parameter is not defined. One of these is required.`
        );
    }

    return {player, inputBridge: inputBridge as InputBridge};
}

export enum RotateState {
    None = 0,
    Reset = 1,
}

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
 * @see {@link PlayerRotate} for rotating the player
 * @see {@link HeadCollissionMove} for pushing the player backwards when their head collides with a wall / object
 * @see {@link HeadCollissionFade} for fading to black when the player's head collides with a wall / object
 */
export class PlayerController extends Component {
    static TypeName = 'player-controller';

    @property.object()
    inputBridgeObject: Object3D | null = null;

    @property.float(10)
    speed = 10;

    private _physx!: PhysXComponent;
    private _headForward: vec3 = [0, 0, 0];
    private _activeCamera!: ActiveCamera;
    private _isRotating = false;
    private _rotateState = RotateState.None;

    private _inputBridge!: InputBridge;

    private _movement = vec3.create();

    start() {
        const tempActiveCamera = this.object.getComponent(ActiveCamera);
        if (!tempActiveCamera) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a ActiveCamera`
            );
        }
        this._activeCamera = tempActiveCamera;

        const {inputBridge, player} = getRequiredComponents(
            this.object,
            this.inputBridgeObject
        );
        this._inputBridge = inputBridge;
    }

    onActivate(): void {
        const physx = this.object.getComponent(PhysXComponent);
        if (!physx) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a Physx`
            );
        }
        this._physx = physx;
        this._physx.kinematic = true;
        this._physx.active = false;
        this._physx.active = true;
    }

    update(): void {
        vec3.zero(this._movement);
        this._inputBridge.getMovementAxis(this._movement);
        const moving =
            this._movement[0] !== 0 || this._movement[1] !== 0 || this._movement[2] !== 0;
        vec3.scale(this._movement, this._movement, this.speed);

        if (moving) {
            this.move(this._movement);
        }

        if (this._rotateState !== RotateState.Reset) {
            return;
        }

        /** @todo: Axis need to be locked after a rotation to prevent torque
         * when hitting walls. Wonderland Engine doesn't yet update axis lock on the fly,
         * the line below should be uncommented at version 1.2.0 */
        // this._physxComponent.angularLockAxis = LockAxis.X | LockAxis.Y | LockAxis.Z;
        this._physx.kinematic = true;
        this._isRotating = false;
        this._rotateState = RotateState.None;
    }

    /**
     * Moves the player in the given direction.
     * @param movement The direction to move in.
     */
    move(movement: vec3) {
        if (this._isRotating || this.physx.kinematic) {
            // for now, don't move while rotating or when kinematic is on.
            // Because we use physics to move, we need to switch to kinematic mode
            // during rotation.
            return;
        }

        // Move according to headObject Forward Direction
        const currentCamera = this._activeCamera.current;
        currentCamera.getForwardWorld(this._headForward);

        // Combine direction with headObject
        vec3.transformQuat(movement, movement, currentCamera.getTransformWorld());

        // Do not move on Y axis
        movement[1] = 0;

        // Add force to Physx Component to move the player
        this._physx.addForce(movement);
    }

    /**
     * Rotates the player on the Y axis for the given amount of degrees.
     * Can be called every frame.
     */
    rotateSnap(angle: number) {
        if (!this._physx.kinematic) {
            this._isRotating = true;
            this._physx.kinematic = true;
            this._rotateState = RotateState.Reset;
        }
        const rot = vec3.set(_vectorA, 0, 1, 0);
        this.object.rotateAxisAngleDegObject(rot, -angle);
    }

    rotateSmooth(angle: number) {
        /** @todo: Axis need to be unlocked before rotation.
         * the line below should be uncommented at version 1.2.0 */
        // this._physxComponent.angularLockAxis = LockAxis.X | LockAxis.Z;
        const rot = vec3.set(_vectorA, 0, -toRad(angle), 0);
        this._physx.addTorque(rot, ForceMode.VelocityChange);
        this._rotateState = RotateState.Reset;
    }

    /**
     * Sets the player's position and rotation.
     * @param location the location to move to
     * @param rotation the rotation to rotate to in radians
     */
    setPositionRotation(location: vec3, rotation: number) {
        this.object.resetRotation();
        this.object.rotateAxisAngleRadObject([0, 1, 0], rotation);

        // Correct for room scale
        this._activeCamera.getPositionWorld(tempCameraVec);
        this.object.getPositionWorld(tempPlayerVec);

        vec3.sub(tempPlayerVec, tempCameraVec, tempPlayerVec);
        tempPlayerVec[0] += location[0];
        tempPlayerVec[1] = location[1];
        tempPlayerVec[2] += location[2];

        this.object.setPositionWorld(location);
    }

    get physx() {
        return this._physx;
    }
}
