import {Alignment, Component, Material, property, Skin, TextComponent, Type, WonderlandEngine} from '@wonderlandengine/api';
import { HandTracking } from '@wonderlandengine/components';

import {Interactor} from '../interactor.js';

import {quat, quat2} from 'gl-matrix';
import { HandAvatarComponent } from '../hand.js';

enum State {
    Waiting,
    Timeout,
}

export class HandPoser extends Component {
    static TypeName = 'hand-poser';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(HandTracking);
    }

    @property.material({required: true})
    materialText!: Material;

    tracking: HandTracking = null!;

    private _timeout: number = 0.0;
    private _state = State.Waiting;

    private _text!: TextComponent;

    start() {
        const object3D = this.object.addChild();
        object3D.translateLocal([0, 0, -0.05]);
        object3D.setScalingLocal([0.25, 0.25, 0.25]);
        this._text = object3D.addComponent(TextComponent);
        this._text.alignment = Alignment.Center;
        this._text.text = 'Grab To Snapshot';
    }

    onActivate() {
        const hand = this.object.getComponent(HandAvatarComponent)!;
        if(hand.skinRoot) {
            hand.skinRoot.resetTransform();
        }

        const interactor = this.object.getComponent(Interactor)!;
        interactor.active = false;

        this.tracking = this.object.getComponent(HandTracking) ?? this.object.addComponent(HandTracking, {active: false});
        this.tracking.handSkin = hand.skin;
        this.tracking.handedness = interactor.handedness === 0 ? 'left' : 'right';
        this.tracking.active = true;

        this._text.active = true;
        this._text.material = this.materialText;

        this._state = State.Waiting;
    }

    onDeactivate() {
        const interactor = this.object.getComponent(Interactor)!;
        interactor.active = true;
        this.tracking.active = false;
        this._text.active = false;
    }

    update(dt: number) {
        switch (this._state) {
            case State.Waiting:  {
                if(this.tracking.isGrabbing()) {
                    this._timeout = 3.0;
                    this._state = State.Timeout;
                }
            } break;
            case State.Timeout: {
                this._text.text = `${this._timeout.toFixed(2)}`;
                this._timeout -= dt;
                if (this._timeout <= 0) {
                    this._text.text = 'Grab To Snapshot';
                    this._state = State.Waiting;
                    const snapshot = JSON.stringify(this.snapshot(), null, 4);
                    navigator.clipboard.writeText(snapshot);
                    console.log('HandPoser: Snapshot copied to clipboard!');
                    console.log(snapshot);
                }
            } break;
        }
    }

    snapshot() {
        const hand = this.object.getComponent(HandAvatarComponent)!;
        const snapshot: Record<string, number[]> = {};
        for (const o of hand.joints) {
            if(!o) continue;
            snapshot[o.name] = o.getTransformLocal(new Array(8));
        }
        return snapshot;
    }
}
