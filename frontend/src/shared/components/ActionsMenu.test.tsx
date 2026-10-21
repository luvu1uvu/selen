import { render, screen } from '@testing-library/react'
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
    await vi.waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    // По фокусу с клавиатуры — подсказка; по фокусу от мыши (щелчок, возврат после пункта меню) — нет
    await user.tab()
    expect(menu).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Действия с меткой «Бэкенд»')
  })

  it('после пункта, выбранного мышью, фокус на «⋯», но подсказка не висит', async () => {
    render(<Example />)
    const user = userEvent.setup()
    const menu = screen.getByRole('button', { name: 'Действия с меткой «Бэкенд»' })
    await user.click(menu)
    await user.click(await screen.findByRole('menuitem', { name: 'Изменить…' }))
    await screen.findByRole('dialog', { name: 'Метка' })
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await vi.waitFor(() => expect(menu).toHaveFocus())
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
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
