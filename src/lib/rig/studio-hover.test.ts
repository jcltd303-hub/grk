import test from 'node:test';
import assert from 'node:assert/strict';
import { studioStore } from '../../store/studio';

test('hovering an unchanged target does not trigger a rig redraw', () => {
  const state=studioStore.getState();
  const previous={hoveredBoneId:state.hoveredBoneId,hoveredJoint:state.hoveredJoint};
  let events=0;
  const unsubscribe=studioStore.subscribe(()=>events++);
  try {
    studioStore.setHoveredBoneId('hover-test');
    studioStore.setHoveredBoneId('hover-test');
    studioStore.setHoveredJoint({boneId:'hover-test',type:'start'});
    studioStore.setHoveredJoint({boneId:'hover-test',type:'start'});
    assert.equal(events,2);
  } finally {
    unsubscribe();
    Object.assign(studioStore.getState(),previous);
  }
});
