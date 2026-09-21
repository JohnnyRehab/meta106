// Dependency-free replacement for the drag math in
// js/views/item/moduleBaseItemView.js's bindFaders/calculateFaderMovement.
// No jQuery: plain DOM APIs and addEventListener only.

// Continuous fader (0-1 range), e.g. most knobs in the app.
export function setupFaderPosition(el, value) {
    var slotHeight = el.parentElement.getBoundingClientRect().height;
    var faderThickness = el.getBoundingClientRect().height;
    var topPercentOffset = 1 - value;
    var topPxOffset = (topPercentOffset * slotHeight) - (0.5 * faderThickness);

    el.style.top = topPxOffset + 'px';
}

function calculateContinuousFaderMovement(el, yPos, clickOffset, store) {
    var slot = el.parentElement;
    var rect = slot.getBoundingClientRect();
    var slotTop = rect.top + window.scrollY;
    var slotHeight = rect.height;
    var faderCompensation = clickOffset / slotHeight * 100;
    var position;
    var value;

    if((yPos - faderCompensation) < slotTop) {
        position = -5;
    } else if(yPos > (slotTop + slotHeight + faderCompensation)) {
        position = 95;
    } else {
        position = ((yPos - slotTop) / slotHeight * 100) - faderCompensation;
    }

    el.style.top = position + '%';

    value = (100 - (position + 5)) / 100;
    store.set(el.dataset.param, value);
}

// Convenience: binds a continuous fader knob found by data-param inside
// `container`, sets its initial position, and keeps it in sync with
// changes made elsewhere (RESET, loading a shared patch, MIDI CC learn).
export function bindAndSyncFader(container, param, store) {
    var knob = container.querySelector('[data-param="' + param + '"]');

    bindContinuousFader(knob, store);
    setupFaderPosition(knob, store.get(param));
    store.on('change:' + param, function(value) {
        setupFaderPosition(knob, value);
    });
}

// Binds a plain continuous fader knob to drag with the mouse, updating
// `store` on the knob's data-param as it moves.
export function bindContinuousFader(knobEl, store) {
    var dragging = false;
    var clickOffset = 0;

    knobEl.addEventListener('mousedown', function(e) {
        dragging = true;
        clickOffset = e.pageY - (knobEl.getBoundingClientRect().top + window.scrollY);
        e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
        if(!dragging) {
            return;
        }
        calculateContinuousFaderMovement(knobEl, e.pageY, clickOffset, store);
    });

    window.addEventListener('mouseup', function() {
        dragging = false;
    });
}
