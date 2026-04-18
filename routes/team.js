const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Team = require('../models/Team');
const User = require('../models/User');
const auth = require('../middleware/auth');

const PLAN_QUOTAS = { C: 50, D: 100 };
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── helpers ──────────────────────────────────────────────────────────────────

function requireTeamPlan(user) {
  if (!['C', 'D'].includes(user.subscriptionTier) || !user.isActiveSubscription) {
    return 'Active Plan C or D subscription required to manage a team';
  }
  return null;
}

async function activateMember(member, team) {
  await User.findByIdAndUpdate(member.userId, {
    subscriptionTier: team.plan,
    uploadQuota: PLAN_QUOTAS[team.plan],
    isActiveSubscription: true,
    subscriptionEndDate: team.subscriptionEndDate,
    teamId: team._id,
    teamRole: 'member'
  });
}

async function deactivateMember(userId) {
  await User.findByIdAndUpdate(userId, {
    subscriptionTier: null,
    uploadQuota: 3,
    isActiveSubscription: false,
    subscriptionEndDate: null,
    teamId: null,
    teamRole: null,
    uploadCount: 0
  });
}

// ── POST /api/teams/create ───────────────────────────────────────────────────
// Owner creates a team. One team per owner.
router.post('/create', auth, async (req, res) => {
  try {
    const user = req.user;
    const err = requireTeamPlan(user);
    if (err) return res.status(403).json({ success: false, error: err });

    const existing = await Team.findOne({ ownerId: user._id });
    if (existing) {
      return res.status(409).json({ success: false, error: 'You already have a team. Disband it before creating a new one.' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Team name is required' });
    }

    const team = await Team.create({
      name: name.trim(),
      ownerId: user._id,
      plan: user.subscriptionTier,
      maxMembers: Team.maxMembersForPlan(user.subscriptionTier),
      subscriptionEndDate: user.subscriptionEndDate,
      members: []
    });

    await User.findByIdAndUpdate(user._id, { teamId: team._id, teamRole: 'owner' });

    res.status(201).json({ success: true, team: _formatTeam(team) });
  } catch (error) {
    console.error('Team create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create team' });
  }
});

// ── GET /api/teams ───────────────────────────────────────────────────────────
// Get the caller's team (owner or member).
router.get('/', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.teamId) {
      return res.status(404).json({ success: false, error: 'You are not part of any team' });
    }

    const team = await Team.findById(user.teamId).populate('ownerId', 'name email');
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    const memberIds = team.members.filter(m => m.userId).map(m => m.userId);
    const memberUsers = await User.find({ _id: { $in: memberIds } }).select('name email uploadCount uploadQuota');
    const memberMap = Object.fromEntries(memberUsers.map(u => [u._id.toString(), u]));

    const members = team.members.map(m => ({
      email: m.email,
      status: m.status,
      joinedAt: m.joinedAt,
      ...(m.userId && memberMap[m.userId.toString()]
        ? {
            userId: m.userId,
            name: memberMap[m.userId.toString()].name,
            uploadCount: memberMap[m.userId.toString()].uploadCount,
            uploadQuota: memberMap[m.userId.toString()].uploadQuota
          }
        : {})
    }));

    res.json({
      success: true,
      team: {
        id: team._id,
        name: team.name,
        plan: team.plan,
        maxMembers: team.maxMembers,
        subscriptionEndDate: team.subscriptionEndDate,
        owner: team.ownerId,
        members,
        memberCount: team.members.filter(m => m.status === 'active').length
      }
    });
  } catch (error) {
    console.error('Team get error:', error);
    res.status(500).json({ success: false, error: 'Failed to get team' });
  }
});

// ── POST /api/teams/invite ───────────────────────────────────────────────────
// Owner invites a member by email. Returns an invite token.
router.post('/invite', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.teamRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the team owner can invite members' });
    }

    const err = requireTeamPlan(user);
    if (err) return res.status(403).json({ success: false, error: err });

    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const team = await Team.findById(user.teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    const activeCount = team.members.filter(m => m.status === 'active').length;
    if (activeCount >= team.maxMembers) {
      return res.status(409).json({
        success: false,
        error: `Team is full (${team.maxMembers} members max for Plan ${team.plan})`
      });
    }

    // Reject inviting yourself
    if (email === user.email) {
      return res.status(400).json({ success: false, error: 'You cannot invite yourself' });
    }

    // Reject duplicate pending/active invite
    const duplicate = team.members.find(m => m.email === email);
    if (duplicate) {
      return res.status(409).json({ success: false, error: 'This email already has a pending or active invite' });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    team.members.push({
      email,
      status: 'pending',
      inviteToken,
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS)
    });
    await team.save();

    // In production: send email with this token. For now it's returned in the response.
    const inviteLink = `${process.env.FRONTEND_URL || 'https://anonymous-defenders.vercel.app'}/join-team?token=${inviteToken}`;

    res.status(201).json({
      success: true,
      message: `Invite created for ${email}`,
      inviteToken,
      inviteLink,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS)
    });
  } catch (error) {
    console.error('Team invite error:', error);
    res.status(500).json({ success: false, error: 'Failed to create invite' });
  }
});

// ── POST /api/teams/join/:token ──────────────────────────────────────────────
// Invitee (registered user) accepts an invite.
router.post('/join/:token', auth, async (req, res) => {
  try {
    const user = req.user;
    const { token } = req.params;

    if (user.teamId) {
      return res.status(409).json({ success: false, error: 'You are already in a team. Leave it before joining another.' });
    }

    const team = await Team.findOne({ 'members.inviteToken': token });
    if (!team) return res.status(404).json({ success: false, error: 'Invalid or expired invite token' });

    const member = team.members.find(m => m.inviteToken === token);
    if (!member) return res.status(404).json({ success: false, error: 'Invalid or expired invite token' });

    if (member.status === 'active') {
      return res.status(409).json({ success: false, error: 'This invite has already been used' });
    }

    if (member.inviteExpiresAt < new Date()) {
      return res.status(410).json({ success: false, error: 'This invite has expired' });
    }

    if (member.email !== user.email) {
      return res.status(403).json({ success: false, error: 'This invite was sent to a different email address' });
    }

    // Activate member
    member.userId = user._id;
    member.status = 'active';
    member.joinedAt = new Date();
    member.inviteToken = undefined;
    member.inviteExpiresAt = undefined;
    await team.save();

    await activateMember(member, team);

    res.json({ success: true, message: `You have joined team "${team.name}"`, plan: team.plan });
  } catch (error) {
    console.error('Team join error:', error);
    res.status(500).json({ success: false, error: 'Failed to join team' });
  }
});

// ── DELETE /api/teams/members/:userId ────────────────────────────────────────
// Owner removes a member.
router.delete('/members/:userId', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.teamRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the team owner can remove members' });
    }

    const team = await Team.findById(user.teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    const idx = team.members.findIndex(m => m.userId && m.userId.toString() === req.params.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Member not found in team' });

    const [removed] = team.members.splice(idx, 1);
    await team.save();

    if (removed.userId) await deactivateMember(removed.userId);

    res.json({ success: true, message: 'Member removed from team' });
  } catch (error) {
    console.error('Team remove member error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// ── POST /api/teams/leave ─────────────────────────────────────────────────────
// Member leaves the team voluntarily.
router.post('/leave', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.teamRole !== 'member') {
      return res.status(403).json({ success: false, error: 'Only team members can leave. Owners must disband the team.' });
    }

    const team = await Team.findById(user.teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    team.members = team.members.filter(m => !m.userId || m.userId.toString() !== user._id.toString());
    await team.save();

    await deactivateMember(user._id);

    res.json({ success: true, message: 'You have left the team' });
  } catch (error) {
    console.error('Team leave error:', error);
    res.status(500).json({ success: false, error: 'Failed to leave team' });
  }
});

// ── DELETE /api/teams ─────────────────────────────────────────────────────────
// Owner disbands the team (removes all members and deletes team).
router.delete('/', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.teamRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the team owner can disband the team' });
    }

    const team = await Team.findById(user.teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    // Deactivate all active members
    const activeMembers = team.members.filter(m => m.status === 'active' && m.userId);
    await Promise.all(activeMembers.map(m => deactivateMember(m.userId)));

    await Team.findByIdAndDelete(team._id);
    await User.findByIdAndUpdate(user._id, { teamId: null, teamRole: null });

    res.json({ success: true, message: 'Team disbanded and all members removed' });
  } catch (error) {
    console.error('Team disband error:', error);
    res.status(500).json({ success: false, error: 'Failed to disband team' });
  }
});

// ── DELETE /api/teams/invite ──────────────────────────────────────────────────
// Owner revokes a pending invite by email.
router.delete('/invite', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.teamRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the team owner can revoke invites' });
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const team = await Team.findById(user.teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    const idx = team.members.findIndex(m => m.email === email && m.status === 'pending');
    if (idx === -1) return res.status(404).json({ success: false, error: 'No pending invite found for this email' });

    team.members.splice(idx, 1);
    await team.save();

    res.json({ success: true, message: `Invite for ${email} revoked` });
  } catch (error) {
    console.error('Team revoke invite error:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke invite' });
  }
});

function _formatTeam(team) {
  return {
    id: team._id,
    name: team.name,
    plan: team.plan,
    maxMembers: team.maxMembers,
    subscriptionEndDate: team.subscriptionEndDate,
    memberCount: team.members.filter(m => m.status === 'active').length
  };
}

module.exports = router;
