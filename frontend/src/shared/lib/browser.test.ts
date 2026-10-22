import { copyText, fileReturnPath } from './browser'

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
      // Адрес строит сервер — строчными; /FILES/… nginx отдал бы SPA, ?DOWNLOAD=1 сервер не увидел бы
      `/FILES/${id}`,
      `/files/${id}?DOWNLOAD=1`,
    ])
      expect(fileReturnPath(`?next=${encodeURIComponent(next)}`), next).toBeNull()
    expect(fileReturnPath('')).toBeNull()
  })
})

describe('copyText — копирование в буфер обмена', () => {
  // В jsdom буфера обмена нет — как у страницы не на https и не на localhost
  const setClipboard = (value: unknown) =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
  afterEach(() => Reflect.deleteProperty(navigator, 'clipboard'))

  it('true — только если браузер скопировал', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('a')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('a')

    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    expect(await copyText('b')).toBe(false)

    setClipboard(undefined)
    expect(await copyText('c')).toBe(false)
  })
})
