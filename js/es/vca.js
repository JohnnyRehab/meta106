// VCA panel, migrated to the final architecture (see js/es/hpf.js for
// the rationale/pattern this follows).
import { setupFaderPosition, bindContinuousFader } from './fader.js';
import { setupSwitchPosition, bindSwitch } from './switch.js';

export function createVcaView(container, store) {
    container.classList.add('module', 'four');
    container.innerHTML =
        '<div class="vca control">' +
            '<div class="module__header--first">' +
                '<h4>VCA</h4>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label">LEVEL</span>' +
                '</div>' +
                '<div class="knob-container--vca">' +
                    '<p>ENV</p>' +
                    '<div class="switch">' +
                        '<div class="switch__knob midi" data-param="vca-envEnabled" data-value="0" data-length="2"></div>' +
                    '</div>' +
                    '<p>GATE</p>' +
                '</div>' +
                '<div class="fader-container--slim">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="vca-level">' +
                                    '<hr>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    var levelKnob = container.querySelector('[data-param="vca-level"]');
    var envSwitch = container.querySelector('[data-param="vca-envEnabled"]');

    bindContinuousFader(levelKnob, store);
    setupFaderPosition(levelKnob, store.get('vca-level'));
    store.on('change:vca-level', function(value) {
        setupFaderPosition(levelKnob, value);
    });

    bindSwitch(envSwitch, store);
    setupSwitchPosition(envSwitch, store.get('vca-envEnabled'));
    store.on('change:vca-envEnabled', function(value) {
        setupSwitchPosition(envSwitch, value);
    });
}
