#!/usr/bin/env python3
"""
CyberTriage Python Analysis Engine
JSON IPC entry point — reads commands from stdin, writes results to stdout.
"""
import sys
import json
import traceback
import sqlite3
import os

# Add the python directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from analyzer.core import CaseAnalyzer
from utils.db import init_db

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cybertriage.db')


def send(obj: dict):
    print(json.dumps(obj), flush=True)


def handle(cmd: dict) -> dict:
    action = cmd.get('action', '')
    payload = cmd.get('payload', {})

    db = init_db(DB_PATH)
    analyzer = CaseAnalyzer(db)

    try:
        if action == 'ping':
            return {'ok': True, 'result': 'pong'}

        elif action == 'create_case':
            result = analyzer.create_case(
                name=payload['name'],
                description=payload.get('description', ''),
                investigator=payload.get('investigator', 'Student Investigator')
            )
            return {'ok': True, 'result': result}

        elif action == 'list_cases':
            result = analyzer.list_cases()
            return {'ok': True, 'result': result}

        elif action == 'get_case':
            result = analyzer.get_case(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'import_evidence':
            result = analyzer.import_evidence(
                case_id=payload['case_id'],
                file_path=payload['file_path']
            )
            return {'ok': True, 'result': result}

        elif action == 'run_analysis':
            result = analyzer.run_full_analysis(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_artifacts':
            result = analyzer.get_artifacts(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_iocs':
            result = analyzer.get_iocs(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_timeline':
            result = analyzer.get_timeline(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_risk_findings':
            result = analyzer.get_risk_findings(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_network_activity':
            result = analyzer.get_network_activity(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_evidence':
            result = analyzer.get_evidence(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'get_dashboard_stats':
            result = analyzer.get_dashboard_stats(payload['case_id'])
            return {'ok': True, 'result': result}

        elif action == 'generate_report':
            result = analyzer.generate_report(
                case_id=payload['case_id'],
                format=payload.get('format', 'json'),
                output_path=payload.get('output_path', '')
            )
            return {'ok': True, 'result': result}

        elif action == 'load_sample_data':
            result = analyzer.load_sample_data(payload['case_id'])
            return {'ok': True, 'result': result}

        else:
            return {'ok': False, 'error': f'Unknown action: {action}'}

    except Exception as e:
        return {'ok': False, 'error': str(e), 'trace': traceback.format_exc()}
    finally:
        db.close()


def main():
    send({'status': 'ready', 'engine': 'CyberTriage Python Analysis Engine v1.0'})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            send({'ok': False, 'error': f'Invalid JSON: {e}'})
            continue
        result = handle(cmd)
        if cmd.get('id') is not None:
            result['id'] = cmd['id']
        send(result)


if __name__ == '__main__':
    main()
