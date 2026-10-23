import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from './dialog'
import { Toaster } from './sonner'

describe('Окно и уведомление поверх него (LATER-102)', () => {
  it('щелчок по «×» уведомления закрывает уведомление, а не окно', async () => {
    // В jsdom нет стилей Tailwind: pointer-events-auto у области уведомлений не применяется — проверку CSS выключаем
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpenChange = vi.fn()
    render(
      <>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent closeLabel="Закрыть">
            <DialogTitle>Переместить</DialogTitle>
          </DialogContent>
        </Dialog>
        <Toaster />
      </>,
    )
    act(() => void toast.error('Не удалось переместить'))
    const notice = (await screen.findByText('Не удалось переместить')).closest('li')!

    await user.click(within(notice).getByRole('button', { name: 'Закрыть уведомление' }))

    await waitFor(() =>
      expect(screen.queryByText('Не удалось переместить')).not.toBeInTheDocument(),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Переместить' })).toBeInTheDocument()
  })
})
