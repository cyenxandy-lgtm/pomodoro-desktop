// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('App compact mode', () => {
  it('switches normal and compact views without mutating the running timer snapshot', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '开始' }))
    const normalTime = screen.getByRole('time').getAttribute('datetime')

    fireEvent.click(screen.getByRole('button', { name: '进入紧凑模式' }))

    expect(screen.getByRole('main', { name: '紧凑计时器' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()
    expect(screen.getByRole('time').getAttribute('datetime')).toBe(normalTime)

    fireEvent.click(screen.getByRole('button', { name: '展开完整界面' }))

    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()
    expect(screen.getByRole('time').getAttribute('datetime')).toBe(normalTime)
  })
})
