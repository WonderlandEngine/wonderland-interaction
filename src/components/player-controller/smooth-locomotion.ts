import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {vec3} from 'gl-matrix';
import {InputBridge} from './input-bridge.js';
import {PlayerController, getRequiredComponents} from './player-controller.js';

export class SmoothLocomotion extends Component {
    static TypeName = typename('smooth-locomotion');

    /**
     * Whether or not the player is allowed to move
     */
    @property.bool(true)
    allowMovement = true;

    @property.float(10)
    speed = 10;

    @property.object()
    inputBridgeObject: Object3D | null = null;

    private _playerController!: PlayerController;
    private _movement = vec3.create();
    private _inputBridge!: InputBridge;
    private _moving = false;

    start(): void {
        const {inputBridge, player} = getRequiredComponents(
            this.object,
            this.inputBridgeObject
        );
        this._inputBridge = inputBridge;
        this._playerController = player;
    }

    update() {
        this.updateInputs();
        this.movePlayer();
    }

    private updateInputs() {
        vec3.zero(this._movement);

        if (!this.allowMovement) {
            return;
        }

        this._inputBridge.getMovementAxis(this._movement);
        this._moving =
            this._movement[0] !== 0 || this._movement[1] !== 0 || this._movement[2] !== 0;
        vec3.scale(this._movement, this._movement, this.speed);
    }

    private movePlayer() {
        if (!this.allowMovement || !this._moving) {
            return;
        }

        this._playerController.move(this._movement);
    }
}
