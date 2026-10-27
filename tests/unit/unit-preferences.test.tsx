import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, refresh } = vi.hoisted(() => ({
  createClient: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { saveUnitPreferences } from '../../src/app/actions/unit-preferences';
import { UnitPreferences } from '../../src/app/settings/unit-preferences';
import { instructionEmphasisOptions } from '../../src/lib/recipes/instruction-emphasis';

afterEach(cleanup);

function relativeLuminance(hexColor: string) {
  const channels = hexColor
    .match(/[\da-f]{2}/gi)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hexColor}`);
  const linearChannels = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return (
    0.2126 * (linearChannels[0] ?? 0) +
    0.7152 * (linearChannels[1] ?? 0) +
    0.0722 * (linearChannels[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('unit preference action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults a missing temperature preference to Fahrenheit', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(
        <UnitPreferences
          durationColor="orange"
          handPreference="right"
          ingredientColor="blue"
          ingredientPresentation="standard"
          privatePrintUsesColors
          temperatureColor="red"
          temperatureSystem={undefined as never}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />,
      );

      expect(screen.getByRole('combobox', { name: 'Temperature' }).textContent).toContain(
        'Fahrenheit',
      );
      expect(
        document.querySelector<HTMLInputElement>('input[name="temperature_system"]')?.value,
      ).toBe('fahrenheit');
      expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
        /changing an (?:un)?controlled input/u,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns a visible error when saving account defaults fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'weight');
    formData.set('weight_system', 'metric');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Unit defaults could not be saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: 'metric',
    });
  });

  it('saves the ingredient presentation preference through the owner-derived RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'presentation');
    formData.set('ingredient_presentation', 'ingredient_first');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: null,
      p_ingredient_presentation: 'ingredient_first',
    });
  });

  it('rejects an unsupported ingredient presentation preference', async () => {
    const formData = new FormData();
    formData.set('changed_dimension', 'presentation');
    formData.set('ingredient_presentation', 'compact');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Choose a valid presentation.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('saves a valid hand preference through the owner-derived RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'hand');
    formData.set('hand_preference', 'left');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_hand_preference: 'left',
    });
  });

  it('saves each instruction emphasis color independently', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'temperature_color');
    formData.set('temperature_color', 'dark_blue');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_temperature_color: 'dark_blue',
    });
  });

  it('saves the selected temperature system independently', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'temperature');
    formData.set('temperature_system', 'celsius');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_temperature_system: 'celsius',
    });
  });

  it('rejects unsupported temperature systems before calling Supabase', async () => {
    const formData = new FormData();
    formData.set('changed_dimension', 'temperature');
    formData.set('temperature_system', 'kelvin');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Choose Fahrenheit or Celsius.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('saves private-print color opt-out independently', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'print_colors');
    formData.set('private_print_uses_colors', 'false');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_private_print_uses_colors: false,
    });
  });

  it('saves private-print instruction-photo opt-out independently', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'print_photos');
    formData.set('include_instruction_photos_in_private_print', 'false');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_include_instruction_photos_in_private_print: false,
    });
  });

  it('rejects an invalid private-print photo preference before calling Supabase', async () => {
    const formData = new FormData();
    formData.set('changed_dimension', 'print_photos');
    formData.set('include_instruction_photos_in_private_print', 'sometimes');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Choose a valid print preference.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects an unsupported hand preference before calling Supabase', async () => {
    const formData = new FormData();
    formData.set('changed_dimension', 'hand');
    formData.set('hand_preference', 'ambidextrous');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Choose a valid hand preference.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('restores the saved value and announces a failed save', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    render(
      <UnitPreferences
        durationColor="orange"
        handPreference="right"
        ingredientColor="blue"
        ingredientPresentation="standard"
        privatePrintUsesColors
        temperatureColor="red"
        temperatureSystem="fahrenheit"
        volumeSystem="us_customary"
        weightSystem="us_customary"
      />,
    );

    const weightPreference = screen.getByRole('combobox', { name: 'Weight' });
    fireEvent.click(weightPreference);
    fireEvent.click(screen.getByRole('option', { name: 'Metric' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Unit defaults could not be saved.');
      expect(weightPreference.textContent).toContain('US customary');
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: 'metric',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows independent emphasis swatches and leaves private-print color enabled by default', () => {
    render(
      <UnitPreferences
        durationColor="orange"
        handPreference="right"
        ingredientColor="blue"
        ingredientPresentation="standard"
        privatePrintUsesColors
        temperatureColor="red"
        temperatureSystem="fahrenheit"
        volumeSystem="us_customary"
        weightSystem="us_customary"
      />,
    );

    const ingredientColors = screen.getByRole('group', { name: 'Ingredient color' });
    const temperatureColors = screen.getByRole('group', { name: 'Temperature color' });
    expect(
      within(ingredientColors)
        .getByRole('button', { name: 'Ingredient color: Blue' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      within(temperatureColors)
        .getByRole('button', { name: 'Temperature color: Red' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      within(screen.getByRole('group', { name: 'Duration color' }))
        .getByRole('button', { name: 'Duration color: Orange' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      screen
        .getByRole('checkbox', { name: 'Omit instruction emphasis when printing' })
        .getAttribute('checked'),
    ).toBeNull();
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Omit instruction photos when printing',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it('restores the saved private-print photo setting when its save fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    render(
      <UnitPreferences
        durationColor="orange"
        handPreference="right"
        includeInstructionPhotosInPrivatePrint
        ingredientColor="blue"
        ingredientPresentation="standard"
        privatePrintUsesColors
        temperatureColor="red"
        temperatureSystem="fahrenheit"
        volumeSystem="us_customary"
        weightSystem="us_customary"
      />,
    );

    const omitPhotos = screen.getByRole('checkbox', {
      name: 'Omit instruction photos when printing',
    });
    fireEvent.click(omitPhotos);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Print preference could not be saved.');
      expect((omitPhotos as HTMLInputElement).checked).toBe(false);
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_include_instruction_photos_in_private_print: false,
    });
  });

  it('opens a 4-by-4 color palette and saves a selected color', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    render(
      <UnitPreferences
        durationColor="orange"
        handPreference="right"
        ingredientColor="blue"
        ingredientPresentation="standard"
        privatePrintUsesColors
        temperatureColor="red"
        temperatureSystem="fahrenheit"
        volumeSystem="us_customary"
        weightSystem="us_customary"
      />,
    );

    const selector = screen.getByRole('group', { name: 'Ingredient color' });
    const trigger = within(selector).getByRole('button', { name: 'Ingredient color: Blue' });
    fireEvent.click(trigger);

    const palette = screen.getByRole('group', { name: 'Ingredient color choices' });
    expect(within(palette).getAllByRole('button')).toHaveLength(16);
    fireEvent.click(
      within(palette).getByRole('button', { name: 'Set ingredient color to Dark Blue' }),
    );

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
        p_ingredient_color: 'dark_blue',
      });
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('Ingredient color: Dark Blue');
  });

  it('restores the saved instruction color when its save fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    render(
      <UnitPreferences
        durationColor="orange"
        handPreference="right"
        ingredientColor="blue"
        ingredientPresentation="standard"
        privatePrintUsesColors
        temperatureColor="red"
        temperatureSystem="fahrenheit"
        volumeSystem="us_customary"
        weightSystem="us_customary"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Ingredient color: Blue' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Set ingredient color to Dark Blue' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Instruction color could not be saved.');
      expect(trigger.getAttribute('aria-label')).toBe('Ingredient color: Blue');
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_ingredient_color: 'dark_blue',
    });
  });

  it('offers eight dark colors, None, and seven standard colors with readable contrast', () => {
    const darkOptions = instructionEmphasisOptions.filter((option) => option.group === 'dark');
    const noneOptions = instructionEmphasisOptions.filter((option) => option.group === 'none');
    const standardOptions = instructionEmphasisOptions.filter(
      (option) => option.group === 'standard',
    );

    expect(darkOptions).toHaveLength(8);
    expect(noneOptions).toHaveLength(1);
    expect(standardOptions).toHaveLength(7);
    expect(instructionEmphasisOptions.map((option) => option.label)).toEqual([
      'None',
      'Navy',
      'Red',
      'Dark Red',
      'Orange',
      'Dark Orange',
      'Yellow',
      'Dark Yellow',
      'Green',
      'Dark Green',
      'Blue',
      'Dark Blue',
      'Purple',
      'Dark Purple',
      'Pink',
      'Dark Pink',
    ]);
    for (const option of instructionEmphasisOptions.filter((item) => item.group !== 'none')) {
      for (const background of ['#e9efad', '#ffffcc', '#ffffff']) {
        expect(contrastRatio(option.color, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(instructionEmphasisOptions.find((option) => option.value === 'black')).toMatchObject({
      label: 'Dark Pink',
      color: '#681b4f',
    });
    expect(instructionEmphasisOptions.find((option) => option.value === 'navy')).toMatchObject({
      label: 'Navy',
      color: '#334155',
    });
  });

  it('saves the presentation default and restores it when saving fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    render(
      <UnitPreferences
        durationColor="orange"
        handPreference="right"
        ingredientColor="blue"
        ingredientPresentation="standard"
        privatePrintUsesColors
        temperatureColor="red"
        temperatureSystem="fahrenheit"
        volumeSystem="us_customary"
        weightSystem="us_customary"
      />,
    );

    const presentation = screen.getByRole('combobox', { name: 'View' });
    expect(presentation.textContent).toContain('Standard');
    fireEvent.click(presentation);
    fireEvent.click(screen.getByRole('option', { name: 'Ingredient-first' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Presentation preference could not be saved.',
      );
      expect(presentation.textContent).toContain('Standard');
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: null,
      p_ingredient_presentation: 'ingredient_first',
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
