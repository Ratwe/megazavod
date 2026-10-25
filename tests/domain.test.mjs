import test from 'node:test'
import assert from 'node:assert/strict'
import { availableDefinitions, conditionMatches, resolveCouncilBallots } from '../src/story/domain.ts'

test('conditions combine facts, completions, phases and negation', () => {
  const context = { phase: 'investigation', facts: new Set(['drive_worn']), completed: new Set(['drive-diagnostics']), councilResult: null }
  assert.equal(conditionMatches({ all: [{ fact: 'drive_worn' }, { completed: 'drive-diagnostics' }, { not: { fact: 'manual_cutoff' } }] }, context), true)
  assert.equal(conditionMatches({ councilResult: 'launch' }, context), false)
})

test('initial state exposes only authored nearby work', () => {
  const context = { phase: 'investigation', facts: new Set(), completed: new Set(), councilResult: null }
  const works = availableDefinitions(context, { mechanics: 1, power: 1, repair: 1 }).map(item => item.definition.id)
  assert.deepEqual(works, ['drive-diagnostics', 'power-audit'])
})

test('council uses equal votes and safe default on tie or no ballots', () => {
  assert.equal(resolveCouncilBallots([]).optionId, 'investigate')
  assert.equal(resolveCouncilBallots(['launch', 'conserve']).optionId, 'investigate')
  assert.equal(resolveCouncilBallots(['launch', 'launch', 'conserve']).optionId, 'launch')
})

test('each council result exposes only its authored branch and reaches a distinct finale', () => {
  const skills = { mechanics: 3, power: 3, repair: 3 }
  const branch = (councilResult, facts = ['drive_worn', 'manual_cutoff'], completed = ['drive-diagnostics', 'power-audit']) => availableDefinitions({ phase: 'branch', facts: new Set(facts), completed: new Set(completed), councilResult }, skills).map(item => item.definition.id)

  assert.equal(branch('investigate').includes('repair-drive'), true)
  assert.equal(branch('launch').includes('bypass-interlock'), true)
  assert.equal(branch('conserve').includes('seal-shaft'), true)
  assert.equal(branch('investigate').includes('bypass-interlock'), false)
  assert.equal(branch('launch').includes('seal-shaft'), false)
  assert.equal(branch('conserve').includes('repair-drive'), false)
  assert.equal(branch('investigate', ['drive_worn', 'manual_cutoff', 'drive_repaired', 'protective_override']).includes('controlled-test'), true)
  assert.equal(branch('launch', ['drive_worn', 'manual_cutoff', 'interlock_bypassed']).includes('emergency-start'), true)
  assert.equal(branch('conserve', ['drive_worn', 'manual_cutoff', 'shaft_sealed']).includes('alternate-supply'), true)
})

