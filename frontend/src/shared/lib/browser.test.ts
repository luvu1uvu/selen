import { appReturnPath, copyText, fileReturnPath } from './browser'

describe('appReturnPath — возврат на страницу приложения после входа (LATER-104)', () => {
  it('принимает только адрес страницы Selen на этом сайте', () => {
    for (const from of [
      '/',
      '/cards/DEV-41',
      '/spaces/DEV/cards/DEV-41',
      '/spaces/DEV?board=5',
      '/boards/3',
      '/profile',
      '/admin/users/01ja0000000000000000000000',
    ])
      expect(appReturnPath(from), from).toBe(from)
    for (const from of [
      undefined,
      42,
      '',
      'cards/DEV-41',
      'https://evil.example/cards/DEV-41',
      '//evil.example',
      '/\\evil.example',
      // Табуляцию и перевод строки браузер из адреса выбрасывает: «/\t/evil» стал бы «//evil»
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
      '/login',
      '/forgot-password',
      '/files/01ja0000000000000000000000',
      // «..» браузер схлопнул бы — адрес вёл бы не туда, куда показывает проверка (аудит LATER-104, S-1)
      '/cards/../files/01ja0000000000000000000000',
      '/cards/%2e%2e/files/01ja0000000000000000000000',
      '/spaces/x/..//evil.example',
    ])
      expect(appReturnPath(from), String(from)).toBeNull()
  })
})

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
