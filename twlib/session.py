
import os
import binascii
import datetime

import tornado.gen
import motor

class SessionMgr(object):

    def __init__(self, app):
        # Keep a link to the owning application.
        self.app = app
    
    @tornado.gen.coroutine
    def create_session(self, handler, email):
        if (not self.app.mongo.connected):
            raise Exception('mongodb not connected')
        
        # Generate a random sessionid.
        byt = os.urandom(24)
        sessionid = binascii.hexlify(byt)
        handler.set_secure_cookie('sessionid', sessionid)
        
        sess = {
            'email': email,
            'name': 'NAME',
            ### and the userid
            'sid': sessionid,
            'ipaddr': handler.request.remote_ip,
            'starttime': datetime.datetime.now(),
            }

        res = yield motor.Op(self.app.mongo.mydb.sessions.insert, sess)
        return res

    @tornado.gen.coroutine
    def find_session(self, handler):
        """
        Look up the user's session, using the sessionid cookie. Returns
        (status, session). The status is 'auth', 'unauth', or 'unknown'
        (if the auth server is unavailable).
        """
        sessionid = handler.get_secure_cookie('sessionid')
        self.app.twlog.info('### sessionid cookie: %s', sessionid)
        if not sessionid:
            return ('unauth', None)
        try:
            res = yield motor.Op(self.app.mongo.mydb.sessions.find,
                                 { 'sid': sessionid })
        except Exception as ex:
            self.app.twlog.error('Error finding session: %s', ex)
            return ('unknown', None)
        self.app.twlog.info('### sessions.find: %s', res)
        if not res:
            return ('unauth', None)
        return ('auth', res)

    def remove_session(self, handler):
        sessionid = handler.get_secure_cookie('sessionid')
        if (sessionid):
            pass ###
        handler.clear_cookie('sessionid')
    
    ### occasionally expire sessions
