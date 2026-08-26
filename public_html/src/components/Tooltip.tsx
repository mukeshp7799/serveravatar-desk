'use client';

import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

/**
 * Global Tooltip wrapper - mounted ONCE in layout.tsx.
 * Any element can opt-in by adding:
 *   data-tooltip-id="app-tooltip"
 *   data-tooltip-content="Your tooltip text"
 *   data-tooltip-place="top"  (default: top)
 *
 * Required-field tooltips:
 *   <input required data-tooltip-id="app-tooltip" data-tooltip-content="This field is required" />
 *
 * Custom styling via --rt-color-dark / --rt-color-light CSS variables
 * (configured in globals.css to match the app's purple/indigo theme).
 */
export default function AppTooltip() {
    return (
        <Tooltip
            id="app-tooltip"
            place="top"
            delayShow={120}
            delayHide={60}
            className="!rounded-md !text-xs !font-medium !px-1.5 !py-1 !bg-black !text-white !max-w-[450px]  !whitespace-normal !break-words !leading-snug"
        />
    );
}
