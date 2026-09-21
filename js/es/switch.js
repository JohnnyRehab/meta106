// Dependency-free replacement for the switch drag math in
// js/views/item/moduleBaseItemView.js (bindSwitches/calculateSwitchMovement/
// updateSwitchUI/getSwitchObject). Faithfully reproduces the same
// position math so behavior matches exactly; no jQuery.

function getPositions(switchEl, length) {
    var switchHeight = switchEl.parentElement.getBoundingClientRect().height;
    var multiplier = switchHeight / length;
    var positions = [];
    var j;

    for(j = 0; j < length; j++) {
        positions.push(j * multiplier);
    }
    return positions;
}

// Sets a switch knob's position from a value (used on load, RESET,
// patch load, MIDI CC, or whenever the value changes from elsewhere).
export function setupSwitchPosition(switchEl, value) {
    var length = parseInt(switchEl.dataset.length, 10);
    var thickness = switchEl.getBoundingClientRect().height;
    var multiplier = switchEl.parentElement.getBoundingClientRect().height / length;
    var positions = getPositions(switchEl, length);
    var offset = value === 0 ? 0 : multiplier * value + (1 / length * value * thickness);
    var positionIndex = 0;
    var j;

    for(j = 0; j < length; j++) {
        if(offset > positions[j]) {
            positionIndex = j;
        }
    }

    switchEl.dataset.value = value;
    switchEl.style.bottom = (positions[positionIndex] + thickness * (1 / length)) + 'px';
}

// Binds a switch knob (any data-length) to drag with the mouse,
// updating `store` on the knob's data-param as it moves.
export function bindSwitch(switchEl, store) {
    var length = parseInt(switchEl.dataset.length, 10);
    var dragging = false;

    function calculateMovement(yPos) {
        var rect = switchEl.parentElement.getBoundingClientRect();
        var switchBottom = rect.top + window.scrollY + rect.height;
        var mouseOffset = switchBottom - yPos;
        var positions = getPositions(switchEl, length);
        var thickness = switchEl.getBoundingClientRect().height;
        var currentValue = parseInt(switchEl.dataset.value, 10);
        var newPosition = 0;
        var j;

        for(j = 0; j < length; j++) {
            if(mouseOffset > positions[j]) {
                newPosition = j;
            }
        }

        switchEl.style.bottom = (positions[newPosition] + 0.5 * thickness) + 'px';

        if(currentValue !== newPosition) {
            switchEl.dataset.value = newPosition;
            store.set(switchEl.dataset.param, newPosition);
        }
    }

    switchEl.addEventListener('mousedown', function(e) {
        dragging = true;
        e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
        if(dragging) {
            calculateMovement(e.pageY);
        }
    });

    window.addEventListener('mouseup', function() {
        dragging = false;
    });
}

// Convenience: binds a switch knob found by data-param inside
// `container`, sets its initial position, and keeps it in sync with
// changes made elsewhere (RESET, loading a shared patch, MIDI CC learn).
export function bindAndSyncSwitch(container, param, store) {
    var knob = container.querySelector('[data-param="' + param + '"]');

    bindSwitch(knob, store);
    setupSwitchPosition(knob, store.get(param));
    store.on('change:' + param, function(value) {
        setupSwitchPosition(knob, value);
    });
}
