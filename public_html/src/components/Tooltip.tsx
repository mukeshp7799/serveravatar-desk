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
            className="!rounded-lg !text-xs !font-medium !px-2.5 !py-1.5 !max-w-[260px] !whitespace-normal !break-words !leading-snug"
            style={{
                backgroundColor: '#1e293b',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            }}
        />
    );
}
