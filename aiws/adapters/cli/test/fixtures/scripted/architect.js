import { write, work, req } from './_lib.js';

const round = process.env.AIWS_DESIGN_NOTE ?? '';

write(work('02-design.md'), `
# ${req} — Thiết kế

## Tổng quan
Thêm hàm setNickname ở BE và dùng nickname trong displayName ở FE. ${round}

## Quyết định chính
- D1: Lưu nickname như trường của user — Lý do: đơn giản.

## API
- PUT /users/{id}/nickname

## DB change
- users: thêm cột nickname (nullable)

## BE change
- source-be/src/users.js: setNickname(id, nickname)

## FE change
- source-fe/src/view.js: displayName ưu tiên nickname

## Migration
Không có

## Rủi ro
Không đáng kể

## Quyết định cần duyệt
- Giới hạn 30 ký tự
`);

write(work('api-contract.yaml'), `
openapi: 3.0.3
info: {title: ${req}, version: 1.0.0}
paths:
  /users/{id}/nickname:
    put:
      parameters:
        - {name: id, in: path, required: true, schema: {type: string}}
      requestBody:
        content:
          application/json:
            schema: {type: object, required: [nickname], properties: {nickname: {type: string, minLength: 1, maxLength: 30}}}
      responses:
        "200": {description: OK}
        "400": {description: invalid nickname}
`);
console.log('design done');
