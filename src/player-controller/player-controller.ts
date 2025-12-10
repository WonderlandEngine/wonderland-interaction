import {
    Component,
    ForceMode,
    InputComponent,
    InputType,
    LockAxis,
    Object3D,
    PhysXComponent,
    property,
    ViewComponent,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';
import {
    DefaultPlayerControllerInput,
    PlayerControllerInput,
} from './player-controller-input.js';
import {toRad} from '../utils/math.js';
import {EPSILON, UP, ZERO_VEC3} from '../constants.js';
import {componentError} from '../utils/wle.js';
import {TempVec3} from '../internal-constants.js';

/* Constants */

const BASE_ROT_SPEED = 25;
const SNAP_LOW_THRESHOLD = 0.2;
const SNAP_HIGH_THRESHOLD = 0.2;

/**
 * The type of rotation to use when turning the player
 */
export enum RotationType {
    None = 0,
    /**
     * Snap will rotate by a fix amount of degrees in a row.
     *
     * It's the most comfortable for most people.
     */
    Snap = 1,
    /**
     * Smooth rotation over multiple frame.
     *
     * Smooth rotation is the most immersive, but can cause motion sickness.
     */
    Smooth = 2,
}
/** List of string keys for {@link RotationType}. */
export const RotationTypeNames = ['None', 'Snap', 'Smooth'];

/**
 * This component is attached to the player object and is responsible for
 * controlling the player's movement and rotation.
 *
 * It needs to have a physx component attached to it. And be on the root of the
 * player hierarchy.
 *
 *
 * @see {@link PlayerControllerInput} for handling input from various input providers
 */
export class PlayerController extends Component {
    static TypeName = 'player-controller';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(ActiveCamera);
        engine.registerComponent(DefaultPlayerControllerInput);
    }

    /** Tracked space onto which the rotation is applied */
    @property.object({required: true})
    trackedSpace!: Object3D;

    /** Object  */
    @property.object()
    inputObject: Object3D | null = null;

    /* Locomotion properties */

    /** Walk speed multiplier. */
    @property.float(1)
    walkSpeed = 1;

    /* Rotation properties */

    @property.enum(RotationTypeNames, RotationType.Snap)
    rotationType = RotationType.Snap;

    /**
     * The number of degrees at which the player rotates when snap-rotating
     */
    @property.float(45)
    snapDegrees = 45;

    /**
     * Rotation speed multiplier.
     *
     * @note Only used when {@link rotationType} is {@link RotationType.Smooth}.
     */
    @property.float(1)
    rotationSpeed = 1;

    private _activeCamera!: ActiveCamera;
    private _physx!: PhysXComponent;
    private _input!: PlayerControllerInput;

    private _snapped = false;

    start() {
        let maybeCamera = this.object.getComponent(ActiveCamera);
        let maybeInput = (this.inputObject ?? this.object).getComponent(
            DefaultPlayerControllerInput
        );

        let left: InputComponent | null = null;
        let right: InputComponent | null = null;
        let eyeLeft: InputComponent | null = null;
        let eyeRight: InputComponent | null = null;

        if (!maybeCamera || !maybeInput) {
            const inputs = this.scene.getComponents(InputComponent);
            for (const input of inputs) {
                switch (input.inputType) {
                    case InputType.ControllerLeft:
                        left = input;
                        break;
                    case InputType.ControllerRight:
                        right = input;
                        break;
                    case InputType.EyeLeft:
                        eyeLeft = input;
                        break;
                    case InputType.EyeRight:
                        eyeRight = input;
                        break;
                }
            }
        }

        if (!maybeCamera) {
            /* No ActiveCamera found, try our best to create one automatically */

            const views = this.scene.getComponents(ViewComponent);
            let mainView: ViewComponent | null = null;
            for (const view of views) {
                if (view.object.getComponent(InputComponent)) continue;
                mainView = view;
                break;
            }
            if (!eyeLeft) {
                throw new Error(
                    componentError(
                        this,
                        "'ActiveCamera' component not provided, and left eye couldn't be found"
                    )
                );
            }
            if (!eyeRight) {
                throw new Error(
                    componentError(
                        this,
                        "'ActiveCamera' component not provided, and right eye couldn't be found"
                    )
                );
            }
            if (!mainView) {
                throw new Error(
                    componentError(
                        this,
                        "'ActiveCamera' component not provided, and non VR view couldn't be found"
                    )
                );
            }
            maybeCamera = this.object.addComponent(ActiveCamera, {
                nonVrCamera: mainView.object,
                leftEye: eyeLeft.object,
                rightEye: eyeRight.object,
            });
        }
        this._activeCamera = maybeCamera;

        if (!maybeInput) {
            /* No input bridge found, try our best to create one automatically */

            if (!left) {
                throw new Error(
                    componentError(
                        this,
                        "'PlayerControllerInput' component not provided, and left controller couldn't be found"
                    )
                );
            }
            if (!right) {
                throw new Error(
                    componentError(
                        this,
                        "'PlayerControllerInput' component not provided, and right controller couldn't be found"
                    )
                );
            }
            maybeInput = this.object.addComponent(DefaultPlayerControllerInput, {
                leftControlObject: left.object,
                rightControlObject: right.object,
            });
        }
        this._input = maybeInput;
    }

    onActivate(): void {
        const physx = this.object.getComponent(PhysXComponent);
        if (!physx) {
            throw new Error(componentError(this, 'Missing required physx component'));
        }
        this._physx = physx;
        this._physx.angularLockAxis = LockAxis.X | LockAxis.Y | LockAxis.Z;

        this._snapped = false;
    }

    update(dt: number): void {
        /* Rotation update */

        const inputRotation = TempVec3.get();
        this._input.getRotationAxis(inputRotation);

        let rotation = 0.0;
        switch (this.rotationType) {
            case RotationType.Snap: {
                const value = inputRotation[0];
                if (Math.abs(value) < SNAP_LOW_THRESHOLD) {
                    this._snapped = false;
                    break;
                }
                /* Need to release trigger before snapping again */
                if (this._snapped || Math.abs(value) < SNAP_HIGH_THRESHOLD) {
                    break;
                }
                this._snapped = true;
                rotation = value < 0 ? -this.snapDegrees : this.snapDegrees;
                break;
            }
            case RotationType.Smooth: {
                const value = inputRotation[0];
                if (Math.abs(value) > EPSILON) {
                    rotation = value * this.rotationSpeed * dt * BASE_ROT_SPEED;
                }
                break;
            }
        }
        if (Math.abs(rotation) > EPSILON) {
            this.trackedSpace.rotateAxisAngleDegLocal(UP, -rotation);
        }

        /* Position update */

        const movement = TempVec3.get();
        this._input.getMovementAxis(movement);
        if (!vec3.equals(movement, ZERO_VEC3)) {
            this.move(movement);
        }

        TempVec3.free(2);
    }

    /**
     * Moves the player in the given direction.
     * @param movement The direction to move in.
     */
    move(movement: vec3) {
        const currentCamera = this._activeCamera.current;

        const direction = TempVec3.get();
        vec3.transformQuat(direction, movement, currentCamera.getTransformWorld());
        direction[1] = 0;
        vec3.normalize(direction, direction);
        vec3.scale(direction, direction, this.walkSpeed);

        this._physx.linearVelocity = direction;

        TempVec3.free();
    }
}
