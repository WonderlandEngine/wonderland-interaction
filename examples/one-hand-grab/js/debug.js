import { Component, Type } from '@wonderlandengine/api';
import { Grabbable } from 'wle-interaction';

export class DebugComponent extends Component {
    static TypeName = 'debug-component';

    static Properties = {
        target1: { type: Type.Object },
        target2: { type: Type.Object },
    };

    start() {
        // @ts-ignore
        if (WL.xrSession) {
            // @ts-ignore
            this._setup(WL.xrSession);
        } else {
            // @ts-ignore
            WL.onXRSessionStart.push(this._setup.bind(this));
        }
        const grabbable = this.target1.getComponent(Grabbable);
        Grabbable.TypeName
        // Original transformation.
        this._transform1 = [ ...this.target1.transformWorld ];
        this._transform2 = [ ...this.target2.transformWorld ];
    }

    _setup(session) {
        session.addEventListener('squeezestart', (event) => {
            for(let i = 1; i <= 2; ++i) {
                const target = this[`target${i}`];
                const physx = target.getComponent('physx');
                physx.active = false;
                target.transformWorld = this[`_transform${i}`];
            }
        });
    }
}

