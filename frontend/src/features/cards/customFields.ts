/**
 * Пользовательские поля в окне карточки — место под этап 5 (LATER-97): колонка «Поля» меню «+» и поля типа карточки
 * в «Основных параметрах» уже принимают список; этап 5 подключает данные (справочник полей компании, наборы по типу).
 * Сервер и модель данных в UI-1a не менялись.
 */
export interface CustomFieldOption {
  id: string
  name: string
}

/** Поля, которые можно добавить в карточку через «+». До этапа 5 полей нет. */
const NO_FIELDS: CustomFieldOption[] = []

export function useCustomFieldOptions(): CustomFieldOption[] {
  return NO_FIELDS
}
