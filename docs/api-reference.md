# API Reference

> Route Core REST API — v0.1.0

## Base URL

| Environment | URL |
|------------|-----|
| Development | `http://localhost:3001/api` |
| Desktop (embedded) | `http://localhost:3001/api` |

## Authentication

The current version does not require authentication. All endpoints are open. See [Security Policy](./security.md) for planned authentication roadmap.

## Common Response Formats

### Success

```json
{
  "id": "abc123",
  "name": "Main Harness"
}
```

### Error

```json
{
  "error": "Harness not found"
}
```

### Validation Result

```json
{
  "issues": [
    {
      "severity": "error",
      "message": "Duplicate label: J1",
      "componentId": "comp-456"
    }
  ],
  "valid": false
}
```

---

## Health

### `GET /api/health`

Returns server status.

**Response** `200 OK`

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

Desktop mode includes `"mode": "desktop"`.

---

## Harnesses

### `GET /api/harnesses`

List all saved harness designs.

**Response** `200 OK`

```json
[
  {
    "id": "hrn-001",
    "name": "Engine Bay Harness",
    "description": "Main engine wiring",
    "version": "1.0.0",
    "author": "engineer@company.com",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T12:45:00Z"
  }
]
```

---

### `POST /api/harnesses`

Create a new harness design.

**Request Body**

```json
{
  "id": "hrn-001",
  "name": "Engine Bay Harness",
  "description": "Main engine wiring",
  "version": "1.0.0",
  "author": "engineer@company.com",
  "nodes": [],
  "connections": [],
  "wires": [],
  "cables": [],
  "canvas": {
    "zoom": 1,
    "panX": 0,
    "panY": 0,
    "gridSize": 20,
    "snapToGrid": true,
    "showGrid": true
  },
  "revisions": []
}
```

**Response** `201 Created`

```json
{
  "id": "hrn-001"
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | Missing `id` or `name` |

---

### `GET /api/harnesses/:id`

Get a harness by ID, including all components, connections, wires, and cables.

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `id` | path | string | yes | Harness ID |

**Response** `200 OK` — Full `Harness` object.

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | Harness not found |

---

### `PUT /api/harnesses/:id`

Update an existing harness. Supports partial updates (merges with existing data).

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `id` | path | string | yes | Harness ID |

**Request Body** — Partial `Harness` object (only fields to update).

**Response** `200 OK`

```json
{
  "updated": true
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | Harness not found |

---

### `DELETE /api/harnesses/:id`

Delete a harness design.

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `id` | path | string | yes | Harness ID |

**Response** `200 OK`

```json
{
  "deleted": true
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | Harness not found |

---

## Parts Library

### `GET /api/parts`

Search the parts library with optional filters.

**Query Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `q` | string | `""` | Fuzzy search query (name, part number, manufacturer, description, tags) |
| `category` | string | `""` | Filter by category (e.g., `connector`, `relay`, `motor`) |

**Response** `200 OK`

```json
[
  {
    "id": "part-001",
    "name": "JST PH 2-Pin",
    "category": "connector",
    "partNumber": "B2B-PH-K-S",
    "manufacturer": "JST",
    "description": "2-pin JST PH series connector",
    "pins": [
      { "id": "p1", "name": "1", "type": "male" },
      { "id": "p2", "name": "2", "type": "male" }
    ]
  }
]
```

---

### `GET /api/parts/:id`

Get a single part by ID.

**Response** `200 OK` — Full component object.

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | Part not found |

---

### `POST /api/parts`

Add a custom component to the library.

**Request Body**

```json
{
  "name": "Custom Sensor",
  "category": "sensor",
  "partNumber": "SENS-001",
  "manufacturer": "Custom",
  "description": "Custom temperature sensor",
  "pins": [
    { "id": "p1", "name": "VCC", "type": "female", "maxCurrent": 0.5 },
    { "id": "p2", "name": "GND", "type": "female" },
    { "id": "p3", "name": "SIG", "type": "female" }
  ]
}
```

**Response** `201 Created`

```json
{
  "id": "generated-uuid"
}
```

---

### `PUT /api/parts/:id`

Update a part in the library.

**Response** `200 OK`

```json
{
  "updated": true
}
```

---

### `DELETE /api/parts/:id`

Remove a part from the library.

**Response** `200 OK`

```json
{
  "deleted": true
}
```

---

### `GET /api/parts/meta/categories`

List all unique component categories in the library.

**Response** `200 OK`

```json
["connector", "relay", "motor", "fuse", "switch", "sensor", "terminal_block"]
```

---

### `GET /api/parts/meta/manufacturers`

List all unique manufacturers in the library.

**Response** `200 OK`

```json
["JST", "Molex", "Phoenix Contact", "TE Connectivity", "Omron"]
```

---

## Cables

### `GET /api/cables`

List all cable definitions.

**Response** `200 OK`

```json
[
  {
    "id": "cable-001",
    "name": "Power Cable 2C 14AWG",
    "partNumber": "PWR-2C-14",
    "conductors": [
      { "id": "c1", "label": "VCC", "color": "red", "gauge": "14 AWG" },
      { "id": "c2", "label": "GND", "color": "black", "gauge": "14 AWG" }
    ]
  }
]
```

---

### `POST /api/cables`

Create a new cable definition.

**Request Body**

```json
{
  "name": "Signal Cable 4C 22AWG",
  "partNumber": "SIG-4C-22",
  "conductorCount": 4,
  "gauge": "22 AWG",
  "shielded": true,
  "jacketColor": "gray",
  "jacketMaterial": "PVC"
}
```

**Response** `201 Created`

```json
{
  "id": "generated-uuid"
}
```

---

### `GET /api/cables/:id`

Get cable by ID.

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | Cable not found |

---

### `PUT /api/cables/:id`

Update a cable definition.

---

### `DELETE /api/cables/:id`

Delete a cable definition.

---

## Export

### `POST /api/export/validate`

Validate a harness design against design rules.

**Request Body** — Full `Harness` object.

**Response** `200 OK`

```json
{
  "issues": [
    {
      "severity": "error",
      "message": "Component 'J1' has duplicate label",
      "componentId": "comp-001"
    },
    {
      "severity": "warning",
      "message": "Pin 'VCC' on 'J2' is unconnected",
      "componentId": "comp-002",
      "pinId": "pin-001"
    }
  ],
  "valid": false
}
```

**Validation Rules**

| Rule | Severity | Description |
|------|----------|-------------|
| Unconnected pins | warning | Pins not part of any connection |
| Duplicate labels | error | Multiple components with the same label |
| Current rating | error | Wire gauge insufficient for pin max current |
| Overlapping nodes | warning | Components at identical positions |
| Self-connections | error | Connection where source = target component |

---

### `POST /api/export/bom`

Generate a bill of materials.

**Request Body** — Full `Harness` object.

**Response** `200 OK`

```json
{
  "items": [
    {
      "partNumber": "B2B-PH-K-S",
      "description": "JST PH 2-Pin Connector",
      "manufacturer": "JST",
      "quantity": 4,
      "category": "connector"
    }
  ],
  "totalItems": 4,
  "totalUniqueItems": 1
}
```

---

### `POST /api/export/svg`

Export harness as SVG schematic.

**Request Body**

```json
{
  "harness": { /* Full Harness object */ },
  "options": {
    "showGrid": true,
    "showLabels": true,
    "showPinNames": true,
    "width": 1200,
    "height": 800
  }
}
```

**Response** `200 OK`  
Content-Type: `image/svg+xml`

Returns raw SVG string.

---

### `POST /api/export/netlist`

Export connection netlist.

**Request Body** — Full `Harness` object.

**Response** `200 OK`  
Content-Type: `text/plain`

```
* Route Core Netlist
* Generated: 2024-01-15T12:00:00Z

NET "VCC"
  J1.1 -- J2.1
  J3.1 -- J4.1

NET "GND"
  J1.2 -- J2.2
```

---

## Rate Limits

No rate limits are currently enforced. For production deployments behind a reverse proxy, configure rate limiting at the proxy level (see [Deployment Guide](./deployment.md)).

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

| HTTP Status | Meaning |
|------------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (missing/invalid fields) |
| `404` | Resource not found |
| `500` | Internal server error |
