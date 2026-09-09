import { ComponentBuilder, } from '../vendor/editor-core/index.js';
import { createId } from './dom.js';
function normalizedPrefix(component) {
    const candidate = component.designator.replace(/[^A-Za-z]/gu, '').toUpperCase();
    if (candidate)
        return candidate.slice(0, 2);
    switch (component.kind) {
        case 'connector': return 'J';
        case 'device': return 'A';
        case 'branch-point': return 'S';
        case 'termination': return 'T';
        case 'passive': return 'R';
        default: return 'X';
    }
}
function nextDesignator(component, document) {
    const prefix = normalizedPrefix(component);
    const used = new Set(document.componentOrder.map((id) => document.components[id]?.designator).filter(Boolean));
    let number = 1;
    while (used.has(`${prefix}${number}`))
        number += 1;
    return `${prefix}${number}`;
}
export function instantiateLibraryComponent(definition, point, document) {
    const component = structuredClone(definition.component);
    const instanceId = createId('component');
    const designator = nextDesignator(component, document);
    const bankMap = new Map();
    const portMap = new Map();
    component.id = instanceId;
    component.definitionId = definition.id;
    component.designator = designator;
    component.position = { ...point };
    component.labels.title = designator;
    component.labels.subtitle = definition.name;
    component.labels.manufacturer = definition.manufacturer || component.labels.manufacturer;
    component.labels.partNumber = definition.partNumber || component.labels.partNumber;
    component.metadata = {
        ...(component.metadata || {}),
        libraryDefinitionId: definition.id,
        libraryName: definition.name,
        instantiatedAt: new Date().toISOString(),
    };
    component.pinBanks = component.pinBanks.map((bank) => {
        const next = `${instanceId}:bank:${bank.side}:${bankMap.size + 1}`;
        bankMap.set(bank.id, next);
        return { ...bank, id: next, portIds: [] };
    });
    component.ports = component.ports.map((port, index) => {
        const next = `${instanceId}:port:${index + 1}`;
        portMap.set(port.id, next);
        return {
            ...port,
            id: next,
            bankId: port.bankId ? bankMap.get(port.bankId) : undefined,
            metadata: { ...(port.metadata || {}), libraryPortId: port.id },
        };
    });
    const bankLookup = new Map(component.pinBanks.map((bank) => [bank.id, bank]));
    for (const port of component.ports) {
        if (port.bankId)
            bankLookup.get(port.bankId)?.portIds.push(port.id);
    }
    return component;
}
export function duplicateComponent(source, document, offset = { x: 40, y: 40 }) {
    const component = structuredClone(source);
    const instanceId = createId('component');
    const bankMap = new Map();
    const portMap = new Map();
    component.id = instanceId;
    component.designator = nextDesignator(source, document);
    component.labels.title = component.designator;
    component.position = { x: source.position.x + offset.x, y: source.position.y + offset.y };
    component.pinBanks = component.pinBanks.map((bank, index) => {
        const next = `${instanceId}:bank:${bank.side}:${index + 1}`;
        bankMap.set(bank.id, next);
        return { ...bank, id: next, portIds: [] };
    });
    component.ports = component.ports.map((port, index) => {
        const next = `${instanceId}:port:${index + 1}`;
        portMap.set(port.id, next);
        return { ...port, id: next, bankId: port.bankId ? bankMap.get(port.bankId) : undefined };
    });
    const bankLookup = new Map(component.pinBanks.map((bank) => [bank.id, bank]));
    for (const port of component.ports)
        if (port.bankId)
            bankLookup.get(port.bankId)?.portIds.push(port.id);
    component.metadata = { ...(component.metadata || {}), duplicatedFrom: source.id };
    return component;
}
export function buildCustomLibraryComponent(input) {
    const definitionId = createId('library-component');
    const builder = new ComponentBuilder(definitionId, `${input.designatorPrefix || 'X'}?`, input.kind)
        .withLabels({
        title: input.name,
        subtitle: input.subtitle,
        manufacturer: input.manufacturer,
        partNumber: input.partNumber,
    });
    const sides = ['west', 'east', 'north', 'south'];
    for (const side of sides) {
        const sidePorts = input.ports.filter((port) => port.side === side);
        if (!sidePorts.length)
            continue;
        const bankId = `${definitionId}:bank:${side}`;
        builder.addBank({ id: bankId, side, flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false });
        sidePorts.forEach((port, index) => builder.addPort({
            id: `${definitionId}:port:${side}:${index + 1}`,
            label: port.label,
            function: port.function,
            detail: port.detail,
            side,
            bankId,
            electricalClass: port.electricalClass,
            connectionPolicy: { maximumConnections: Math.max(1, port.maximumConnections || 1), allowSelfConnection: false },
        }));
    }
    const component = builder.build();
    const footprint = input.mechanicalFootprints;
    const centeredOffset = (input.ports.length - 1) / 2;
    component.metadata = {
        ...(component.metadata || {}),
        mechanicalFootprints: {
            bodyWidthMm: footprint.bodyWidthMm,
            bodyHeightMm: footprint.bodyHeightMm,
            mateSide: input.ports.map((port, index) => ({
                logicalPin: port.label,
                xMm: (index - centeredOffset) * footprint.pinPitchMm,
                yMm: -footprint.rowSpacingMm / 2,
            })),
            wireSide: input.ports.map((port, index) => ({
                logicalPin: port.label,
                xMm: (centeredOffset - index) * footprint.pinPitchMm,
                yMm: footprint.rowSpacingMm / 2,
            })),
        },
    };
    return {
        id: definitionId,
        name: input.name,
        category: input.category || 'custom',
        manufacturer: input.manufacturer,
        partNumber: input.partNumber,
        tags: input.tags,
        component,
        modifiedAt: new Date().toISOString(),
    };
}
export function createFreeLabel(point, text = 'Annotation') {
    return {
        id: createId('label'),
        text,
        anchor: { ownerKind: 'free', point: { ...point } },
        mode: 'world-pinned',
        orientation: 'horizontal',
        offset: { x: 0, y: 0 },
        worldPosition: { ...point },
        priority: 10,
        avoidWires: true,
        avoidComponents: true,
        allowLeader: false,
        visible: true,
        locked: false,
        style: { fontSize: 11, fontWeight: 500 },
    };
}
//# sourceMappingURL=component-factory.js.map