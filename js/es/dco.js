// DCO panel, migrated to the final architecture (see js/es/hpf.js for
// the rationale/pattern this follows). The most complex panel: two
// discrete switches (RANGE, LFO/MAN), two click-toggle buttons
// (PULSE/SAW), and four continuous faders.
import { bindAndSyncFader } from './fader.js';
import { bindAndSyncSwitch } from './switch.js';
import { bindAndSyncButton } from './button.js';

export function createDcoView(container, store) {
    container.classList.add('module', 'six', 'module--compact');
    container.innerHTML =
        '<div class="dco control">' +
            '<div class="module__header">' +
                '<h4>DCO</h4>' +
            '</div>' +
            '<div class="module__switch-control-group">' +
                '<div class="label-container range">' +
                    '<span class="label">RANGE</span>' +
                '</div>' +
                '<div class="knob-container--range">' +
                    '<p class="range">4\'</p>' +
                    '<p class="range">8\'</p>' +
                    '<p class="range">16\'</p>' +
                    '<div class="switch">' +
                        '<div class="switch__knob midi" data-param="dco-range" data-value="1" data-length="3"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label--wide">LFO</span>' +
                    '<span class="label--wide">PWM</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="lfo-pitchMod" data-value="0" title="Pitch LFO"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="dco-pwm" data-value="0"><hr></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="module__switch-control-group">' +
                '<div class="knob-container--pwm">' +
                    '<span class="label--line">_________</span>' +
                    '<div class="line"></div>' +
                    '<p class="label">LFO</p>' +
                    '<div class="switch">' +
                        '<div class="switch__knob midi" data-param="dco-lfoPwmEnabled" data-value="0" data-length="2"></div>' +
                    '</div>' +
                    '<p class="label">MAN</p>' +
                '</div>' +
            '</div>' +
            '<div class="button-container--stack">' +
                '<div class="button-container--top">' +
                    '<p class="wave-label">PULSE</p>' +
                    '<div class="led"></div>' +
                    '<div class="button button--yellow midi" data-param="dco-pulse" data-value="0" data-length="2"></div>' +
                '</div>' +
                '<div class="button-container--top">' +
                    '<p class="wave-label">SAW</p>' +
                    '<div class="led led--lit"></div>' +
                    '<div class="button button--yellow pressed midi" data-param="dco-sawtooth" data-value="1" title="Saw on/off" data-length="2"></div>' +
                '</div>' +
            '</div>' +
            '<div class="module__control-group sub-noise">' +
                '<div class="label-container">' +
                    '<span class="label">SUB</span>' +
                    '<span class="label">NOISE</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="dco-sub" data-value="0"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="dco-noise" data-value="0"><hr></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    bindAndSyncSwitch(container, 'dco-range', store);
    bindAndSyncSwitch(container, 'dco-lfoPwmEnabled', store);
    bindAndSyncButton(container, 'dco-pulse', store);
    bindAndSyncButton(container, 'dco-sawtooth', store);

    ['lfo-pitchMod', 'dco-pwm', 'dco-sub', 'dco-noise'].forEach(function(param) {
        bindAndSyncFader(container, param, store);
    });
}
