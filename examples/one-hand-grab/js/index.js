import '@wonderlandengine/components/cursor-target.js';
import '@wonderlandengine/components/howler-audio-listener.js';
import '@wonderlandengine/components/howler-audio-source.js';
import '@wonderlandengine/components/hand-tracking.js';
import '@wonderlandengine/components/vr-mode-active-switch.js';

import { Grabbable, Interactable, Interactor } from 'wle-interaction';

import './button';

WL.registerComponent(Interactable);
WL.registerComponent(Interactor);
WL.registerComponent(Grabbable);

