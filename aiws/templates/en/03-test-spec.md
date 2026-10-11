# {req} — Test specification (ISO/IEC/IEEE 29119-3)

## Strategy
<!-- Scope, test levels (unit BE/FE...), design techniques (equivalence partitioning, boundary values, decision tables),
     the framework of each side, what is mocked or faked, test data. -->

## Test cases
<!-- Each test case is a heading "### TC-n: title", numbered without gaps, with every field below.
"covers" is REQUIRED (traceability to the AC). "side" is a side name of policies.yaml (be, fe, mobile...).
In code, the TC id goes into the framework's standard metadata (DisplayName/Tag/Trait/marker/test name) - see the unit-testing skill. -->

### TC-1: ...
- covers: AC-1
- side: be
- level: unit
- type: functional
- priority: high
- objective: ...
- preconditions: ...
- test data: ...
- steps: Given ... / When ... / Then ...
- expected result: ...

### TC-2: ...
- covers: AC-2
- side: be
- level: unit
- type: negative
- priority: high
- objective: ...
- preconditions: ...
- test data: ...
- steps: Given ... / When ... / Then ...
- expected result: ...

## AC matrix
| AC | Test cases |
| --- | --- |
| AC-1 | TC-1 |
| AC-2 | TC-2 |
