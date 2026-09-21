// ENV panel, migrated to the final architecture (see js/es/hpf.js for
// the rationale/pattern this follows).
import { bindAndSyncFader } from './fader.js';

export function createEnvView(container, store) {
    container.classList.add('module', 'six');
    container.innerHTML =
        '<div class="env control">' +
            '<div class="module__header">' +
                '<h4>ENV</h4>' +
            '</div>' +
            '<div class="module__control-group">' +
                '<div class="label-container">' +
                    '<span class="label--wide">A</span>' +
                    '<span class="label--wide">D</span>' +
                    '<span class="label--wide">S</span>' +
                    '<span class="label--wide">R</span>' +
                '</div>' +
                '<div class="fader-container">' +
                    '<div class="fader">' +
                        '<div class="fader__scale--heavy"></div>' +
                        '<div class="fader__scale--light">' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="env-attack"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="env-decay"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="env-sustain"><hr></div>' +
                            '</div>' +
                            '<div class="fader__slot">' +
                                '<div class="fader__knob midi" data-param="env-release"><hr></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    ['env-attack', 'env-decay', 'env-sustain', 'env-release'].forEach(function(param) {
        bindAndSyncFader(container, param, store);
    });
}
