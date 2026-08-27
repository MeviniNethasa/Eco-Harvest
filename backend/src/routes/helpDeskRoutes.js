// backend/src/routes/helpDeskRoutes.js
const express = require('express');
const router = express.Router();
const HelpTicket = require('../models/HelpTicket');

// Helper to generate human-readable ticket ID like HD-7821
function generateTicketId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `HD-${rand}`;
}

// ---------------------------------------------------------------------------
// 1. POST /api/helpdesk/tickets - Create a new support ticket (Customer or Farmer)
// ---------------------------------------------------------------------------
router.post('/tickets', async (req, res) => {
  try {
    const {
      userId,
      userName,
      userRole,
      userPhone,
      orderId,
      category,
      subject,
      priority,
      message,
    } = req.body;

    if (!userId || !userName || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'userId, userName, subject, and initial message are required',
      });
    }

    const ticketId = generateTicketId();

    const newTicket = await HelpTicket.create({
      ticketId,
      userId,
      userName,
      userRole: userRole || 'CUSTOMER',
      userPhone: userPhone || '',
      orderId: orderId || '',
      category: category || 'OTHER',
      subject: subject.trim(),
      priority: priority || 'MEDIUM',
      status: 'OPEN',
      messages: [
        {
          senderRole: userRole || 'CUSTOMER',
          senderId: userId,
          senderName: userName,
          text: message.trim(),
          timestamp: new Date(),
        },
      ],
    });

    console.log(`[HELP DESK] New ticket created: ${ticketId} by ${userName} (${userRole})`);

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: newTicket,
    });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/helpdesk/tickets/user/:userId - Fetch all tickets for a user
// ---------------------------------------------------------------------------
router.get('/tickets/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const tickets = await HelpTicket.find({ userId }).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/helpdesk/tickets/:ticketId - Fetch specific ticket details
// ---------------------------------------------------------------------------
router.get('/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await HelpTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: `Ticket ${ticketId} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 4. POST /api/helpdesk/tickets/:ticketId/messages - Append reply message
// ---------------------------------------------------------------------------
router.post('/tickets/:ticketId/messages', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { senderRole, senderId, senderName, text } = req.body;

    if (!text || !senderName) {
      return res.status(400).json({
        success: false,
        message: 'text and senderName are required',
      });
    }

    const ticket = await HelpTicket.findOne({ ticketId });
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: `Ticket ${ticketId} not found`,
      });
    }

    const newMsg = {
      senderRole: senderRole || 'CUSTOMER',
      senderId: senderId || '',
      senderName,
      text: text.trim(),
      timestamp: new Date(),
    };

    ticket.messages.push(newMsg);

    // If admin replies and ticket was OPEN, change to IN_PROGRESS
    if (senderRole === 'ADMIN' && ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
    }

    // If user replies and ticket was RESOLVED, reopen
    if (senderRole !== 'ADMIN' && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')) {
      ticket.status = 'OPEN';
    }

    await ticket.save();

    console.log(`[HELP DESK] Message added to ticket ${ticketId} by ${senderName} (${senderRole})`);

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      data: ticket,
    });
  } catch (error) {
    console.error('Error sending ticket message:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 5. GET /api/helpdesk/admin/tickets - Admin fetch all tickets with filters
// ---------------------------------------------------------------------------
router.get('/admin/tickets', async (req, res) => {
  try {
    const { status, userRole, priority, search } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (userRole && userRole !== 'ALL') {
      query.userRole = userRole;
    }
    if (priority && priority !== 'ALL') {
      query.priority = priority;
    }
    if (search) {
      query.$or = [
        { ticketId: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
      ];
    }

    const tickets = await HelpTicket.find(query).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error('Error fetching admin tickets:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/helpdesk/admin/tickets/:ticketId/status - Admin status update
// ---------------------------------------------------------------------------
router.patch('/admin/tickets/:ticketId/status', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, resolutionNotes, adminName = 'Admin Team' } = req.body;

    const ticket = await HelpTicket.findOne({ ticketId });
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: `Ticket ${ticketId} not found`,
      });
    }

    if (status) {
      ticket.status = status;
    }
    if (resolutionNotes) {
      ticket.resolutionNotes = resolutionNotes;
      // Add resolution message to thread
      ticket.messages.push({
        senderRole: 'ADMIN',
        senderId: 'admin_desk',
        senderName: adminName,
        text: `[RESOLUTION NOTE]: ${resolutionNotes}`,
        timestamp: new Date(),
      });
    }
    if (status === 'RESOLVED' || status === 'CLOSED') {
      ticket.resolvedAt = new Date();
    }

    await ticket.save();

    console.log(`[HELP DESK] Ticket ${ticketId} updated to ${ticket.status} by ${adminName}`);

    return res.status(200).json({
      success: true,
      message: `Ticket marked as ${ticket.status}`,
      data: ticket,
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 7. GET /api/helpdesk/admin/stats - Admin ticket metrics
// ---------------------------------------------------------------------------
router.get('/admin/stats', async (req, res) => {
  try {
    const [total, open, inProgress, resolved, closed, customerCount, farmerCount] = await Promise.all([
      HelpTicket.countDocuments(),
      HelpTicket.countDocuments({ status: 'OPEN' }),
      HelpTicket.countDocuments({ status: 'IN_PROGRESS' }),
      HelpTicket.countDocuments({ status: 'RESOLVED' }),
      HelpTicket.countDocuments({ status: 'CLOSED' }),
      HelpTicket.countDocuments({ userRole: 'CUSTOMER' }),
      HelpTicket.countDocuments({ userRole: 'FARMER' }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        open,
        inProgress,
        resolved,
        closed,
        customerCount,
        farmerCount,
        pendingCount: open + inProgress,
      },
    });
  } catch (error) {
    console.error('Error getting help desk stats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
