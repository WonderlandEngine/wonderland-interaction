import {property} from '@wonderlandengine/api/decorators.js';
import {Component, Object3D, PhysXComponent} from '@wonderlandengine/api';
import {vec3} from 'gl-matrix';

/**
 * Direction type for Keyboard Inputs.
 */
type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * KeyMap for Keyboard Inputs.
 * If keys need to change or be added in the future, change here.
 *
 * @remarks
 * Because KeyboardEvent.code is used there is no need to worry about keyboard layout.
 * For example: KeyW is always Up, no matter if the keyboard is QWERTY or AZERTY.
 */
const keyMap: {[key: string]: Direction} = {
    arrowUp: 'up',
    keyW: 'up',
    arrowRight: 'right',
    keyD: 'right',
    arrowDown: 'down',
    keyS: 'down',
    arrowLeft: 'left',
    keyA: 'left',
};

/**
 * FPS type movement with WASD keys based on Physx.
 *
 * @remarks
 * The component is dependent on an {@link PhysXComponent} component on the same object.
 *
 * Physx Component Settings:
 * - Shape: Sphere
 * - linearDamping: 5
 * - angularDamping: 5
 * - lock all angularAxis except for Y (For rotation torque ability)(Can be disabled if you don't want Rotation)
 */
export class WasdControlsFps extends Component {
    static TypeName = 'wasd-controls-fps';

    /** Whether or not the player can move */
    @property.bool(true)
    moveActive = true;

    /** Whether or not the player can rotate */
    @property.bool(true)
    rotActive = true;

    /** Movement speed of the player */
    @property.float(12)
    moveSpeed = 12;

    @property.object({required: true})
    inputBridgeObject!: Object3D;

    private up = false;
    private right = false;
    private down = false;
    private left = false;
    private headForward: vec3 = [0, 0, 0];
    private physxComponent?: PhysXComponent;

    init() {
        this.up = false;
        this.right = false;
        this.down = false;
        this.left = false;
    }

    start() {
        const tempPhysx = this.object.getComponent(PhysXComponent);
        if (!tempPhysx) {
            console.error(
                'WasdControlsFps: No PhysX Component found on object. Please add a PhysX Component to the object.'
            );
        }
        this.physxComponent = tempPhysx!;
    }

    onActivate(): void {
        // Set Keyboard Inputs Listeners
        window.addEventListener('keydown', this.pressKeyboard.bind(this));
        window.addEventListener('keyup', this.releaseKeyboard.bind(this));
    }

    onDeactivate(): void {
        // Remove Keyboard Inputs Listeners
        window.removeEventListener('keydown', this.pressKeyboard.bind(this));
        window.removeEventListener('keyup', this.releaseKeyboard.bind(this));
    }

    update(dt: number) {
        // do not move if no input
        if (!this.up && !this.down && !this.left && !this.right) {
            return;
        }

        if (!this.nonVRCamera) {
            console.warn('wasd-controls-fps component requires the nonVRCamera to be set.');
            return;
        }

        if (!this.physxComponent) {
            console.warn(
                'wasd-controls-fps component requires a physxComponent on the object to be present.'
            );
            return;
        }

        // Move via Force Physx
        this.headForward = [0, 0, 0];
        let direction: vec3 = [0, 0, 0];
        if (this.up) direction[2] -= 1.0;
        if (this.down) direction[2] += 1.0;
        if (this.left) direction[0] -= 1.0;
        if (this.right) direction[0] += 1.0;

        // Move according to headObject Forward Direction
        vec3.normalize(direction, direction);
        direction[0] *= this.moveSpeed;
        direction[2] *= this.moveSpeed;
        this.nonVRCamera.getForwardWorld(this.headForward);

        // Combine direction with headObject
        vec3.transformQuat(direction, direction, this.nonVRCamera.getTransformWorld());

        if (this.moveActive) {
            if (this.up || this.down || this.left || this.right) {
                // Do not move on Y axis
                direction[1] = 0;
                // Add force to Physx Component to move the player
                this.physxComponent.addForce(direction);
            }
        }
    }

    pressKeyboard(input: KeyboardEvent) {
        const direction = keyMap[input.code];

        if (direction) {
            this[direction] = true;
        }
    }

    releaseKeyboard(input: KeyboardEvent) {
        const direction = keyMap[input.code];

        if (direction) {
            this[direction] = false;
        }
    }
}
