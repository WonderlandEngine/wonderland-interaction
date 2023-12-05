import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {vec3} from 'gl-matrix';
import {InputBridge} from './input-bridge.js';
import {PlayerController} from './player-controller.js';

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
    inputBridgeObject?: Object3D;

    private _playerController!: PlayerController;

    private _movement = vec3.create();

    private _inputBridge!: InputBridge;
    private _moving = false;

    start(): void {
        const tempPlayerController = this.object.getComponent(PlayerController);
        if (!tempPlayerController) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a PlayerController. This is required.`
            );
        }
        this._playerController = tempPlayerController;

        const tempInputBridge =
            this.inputBridgeObject?.getComponent(InputBridge) ||
            this.object.getComponent(InputBridge);
        if (!tempInputBridge) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a InputBridge and the inputBridgeObject parameter is not defined. One of these is required.`
            );
        }
        this._inputBridge = tempInputBridge;
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

        vec3.copy(this._movement, this._inputBridge.getMovementAxis());
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
