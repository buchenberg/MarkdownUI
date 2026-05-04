# Mermaid Syntax Test

This document tests both standard and Azure DevOps style mermaid syntax.

## Standard Syntax (```mermaid)

```mermaid
graph TD
    A[Standard Syntax] --> B[Works!]
    B --> C{Test}
    C -->|Yes| D[Pass]
    C -->|No| E[Fail]
```

## Azure DevOps Syntax (:::mermaid)

:::mermaid
graph TD
    A[Azure DevOps Syntax] --> B[Also Works!]
    B --> C{Test}
    C -->|Yes| D[Pass]
    C -->|No| E[Fail]
:::

## Multiple Diagrams

### First Diagram (Standard)

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob
    Bob->>Alice: Hello Alice
```

### Second Diagram (Azure DevOps)

:::mermaid
sequenceDiagram
    participant Charlie
    participant Diana
    Charlie->>Diana: Hello Diana
    Diana->>Charlie: Hello Charlie
:::

### Third Diagram (Standard)

```mermaid
graph LR
    X --> Y
    Y --> Z
```

## Conclusion

Both syntaxes should render correctly!
