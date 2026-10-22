import { fileReturnPath } from './browser'

describe('fileReturnPath — возврат к файлу после входа (UI-1b)', () => {
  it('принимает только ссылку на файл этого приложения', () => {
    const id = '01ja0000000000000000000000'
    expect(fileReturnPath(`?next=%2Ffiles%2F${id}`)).toBe(`/files/${id}`)
    expect(fileReturnPath(`?next=${encodeURIComponent(`/files/${id}?download=1`)}`)).toBe(
      `/files/${id}?download=1`,
    )
    for (const next of [
      'https://evil.example/files/x',
      '//evil.example',
      `/files/${id}/../../admin`,
      `/files/${id}?next=//evil`,
      '/admin/users',
      'javascript:alert(1)',
    ])
      expect(fileReturnPath(`?next=${encodeURIComponent(next)}`), next).toBeNull()
    expect(fileReturnPath('')).toBeNull()
  })
})
