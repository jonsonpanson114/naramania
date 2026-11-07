import type { CSSProperties } from 'react';
import { getMunicipalityHue, getProjectTypeColor } from '@/lib/project_colors';

export function ProjectTypeBadge({ type }: { type: string }) {
    return (
        <span className="project-type-badge" style={{ '--project-type-color': getProjectTypeColor(type) } as CSSProperties}>
            {type}
        </span>
    );
}

export function MunicipalityBadge({ name }: { name: string }) {
    const hue = getMunicipalityHue(name);
    return (
        <span className="municipality-badge" style={hue === undefined ? undefined : { '--municipality-hue': hue } as CSSProperties}>
            {name}
        </span>
    );
}
