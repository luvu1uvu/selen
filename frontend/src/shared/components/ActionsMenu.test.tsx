import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { ActionsMenu } from './ActionsMenu'

function Example() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ActionsMenu label="Действия с меткой «Бэкенд»">
        {(dialog) => (
          <DropdownMenuItem onSelect={dialog(() => setOpen(true))}>Изменить…</DropdownMenuItem>
        )}
      </ActionsMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel="Закрыть">
          <DialogTitle>Метка</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('ActionsMenu', () => {
  it('«⋯» — подпись и та же подсказка Tooltip по наведению и по фокусу, без title', async () => {
    render(<Example />)
    const user = userEvent.setup()
    const menu = screen.getByRole('button', { name: 'Действия с меткой «Бэкенд»' })
    expect(menu).not.toHaveAttribute('title')

    await user.hover(menu)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Действия с меткой «Бэкенд»')
    await user.unhover(menu)
    await user.keyboard('{Escape}')

    act(() => menu.focus())
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Действия с меткой «Бэкенд»')
  })

  it('пункт с окном: окно забирает фокус, закрытое — возвращает его на «⋯»', async () => {
    render(<Example />)
    const user = userEvent.setup()
    const menu = screen.getByRole('button', { name: 'Действия с меткой «Бэкенд»' })

    await user.click(menu)
    await user.click(await screen.findByRole('menuitem', { name: 'Изменить…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Метка' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(menu).toHaveFocus()
  })
})
